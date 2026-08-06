import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const roles=new Set(["admin","responsable","employe"]);
const operational=new Set(["salle","cuisine","nettoyage"]);
const protectedEmails=new Set(["contact@srlreunion.com","quentin@lunion.be"]);
const res=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const clean=(value:unknown,max=120)=>String(value??"").trim().slice(0,max);

function accessPayload(payload:Record<string,unknown>,role:string){
  if(role!=="employe")return {primary:"bureau",departments:[] as string[]};
  const primary=clean(payload.departement??payload.primaryDepartment,20).toLowerCase();
  const source=Array.isArray(payload.departments)?payload.departments:[primary];
  const departments=[...new Set(source.map(value=>clean(value,20).toLowerCase()).filter(value=>operational.has(value)))];
  if(!operational.has(primary)||departments.length===0||!departments.includes(primary))throw new Error("Sélectionnez au moins un département et choisissez un département principal parmi les cases cochées.");
  return {primary,departments};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return res({error:"Méthode non autorisée."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")??"",anon=Deno.env.get("SUPABASE_ANON_KEY")??"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"",authorization=req.headers.get("Authorization")??"";
    if(!url||!anon||!service||!authorization)return res({error:"Configuration ou authentification manquante."},401);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i,""));
    const actor=userData.user;
    if(userError||!actor)return res({error:"Session invalide."},401);
    const {data:actorProfile}=await userClient.from("profiles").select("role,actif").eq("id",actor.id).single();
    if(actorProfile?.role!=="admin"||actorProfile?.actif!==true)return res({error:"Cette action est réservée à l’Administrateur."},403);
    const payload=await req.json().catch(()=>({})) as Record<string,unknown>;
    const action=clean(payload.action,30);
    const setAccess=async(id:string,prenom:string,nom:string,role:string,actif:boolean,primary:string,departments:string[])=>{
      const {data,error}=await userClient.rpc("admin_set_user_access",{p_profile_id:id,p_prenom:prenom,p_nom:nom,p_role:role,p_actif:actif,p_primary_department:primary,p_departments:departments});
      if(error)throw error;
      return data;
    };

    if(action==="list"){
      const [{data:authData,error:authError},{data:profiles,error:profilesError},{data:assignments,error:assignmentsError}]=await Promise.all([
        admin.auth.admin.listUsers({page:1,perPage:1000}),
        admin.from("profiles").select("id,email,prenom,nom,role,departement,actif,created_at,updated_at").order("created_at"),
        admin.from("profile_departments").select("profile_id,department,is_primary").order("department")
      ]);
      if(authError)throw authError;if(profilesError)throw profilesError;if(assignmentsError)throw assignmentsError;
      const profileMap=new Map((profiles??[]).map(item=>[item.id,item]));
      const departmentMap=new Map<string,{department:string,is_primary:boolean}[]>();
      for(const item of assignments??[]){const list=departmentMap.get(item.profile_id)??[];list.push({department:item.department,is_primary:item.is_primary});departmentMap.set(item.profile_id,list)}
      return res({users:(authData.users??[]).map(user=>{const profile=(profileMap.get(user.id)??{}) as Record<string,unknown>;const email=String(user.email??profile.email??"");const rows=departmentMap.get(user.id)??[];const departments=rows.map(item=>item.department);const primary=String(profile.departement??rows.find(item=>item.is_primary)?.department??"")||null;return{id:user.id,email,prenom:profile.prenom??"",nom:profile.nom??"",role:profile.role??"employe",departement:primary,departments,actif:profile.actif===true,emailConfirmee:Boolean(user.email_confirmed_at),derniereConnexion:user.last_sign_in_at??null,creeLe:user.created_at??profile.created_at??null,protege:protectedEmails.has(email.toLowerCase())}})});
    }

    if(action==="create"){
      const email=clean(payload.email,254).toLowerCase(),prenom=clean(payload.prenom,80),nom=clean(payload.nom,100),role=clean(payload.role,20).toLowerCase(),password=String(payload.password??"");
      if(!email.includes("@")||!prenom||!nom||!roles.has(role)||password.length<10)return res({error:"Informations invalides ou mot de passe trop court."},400);
      const access=accessPayload(payload,role);
      const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{prenom,nom,role,departement:access.primary,departments:access.departments}});
      if(error||!data.user)throw error??new Error("Compte non créé.");
      try{await setAccess(data.user.id,prenom,nom,role,true,access.primary,access.departments)}catch(error){await admin.auth.admin.deleteUser(data.user.id);throw error}
      return res({user:{id:data.user.id,email,prenom,nom,role,departement:access.primary,departments:access.departments,actif:true}},201);
    }

    if(action==="invite"){
      const email=clean(payload.email,254).toLowerCase(),prenom=clean(payload.prenom,80),nom=clean(payload.nom,100),role=clean(payload.role,20).toLowerCase(),redirectTo=clean(payload.redirectTo,500);
      if(!email.includes("@")||!prenom||!nom||!roles.has(role))return res({error:"Invitation incomplète ou invalide."},400);
      const access=accessPayload(payload,role);
      const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:redirectTo||undefined,data:{prenom,nom,role,departement:access.primary,departments:access.departments}});
      if(error||!data.user)throw error??new Error("Invitation non créée.");
      try{await setAccess(data.user.id,prenom,nom,role,true,access.primary,access.departments)}catch(error){await admin.auth.admin.deleteUser(data.user.id);throw error}
      await admin.from("user_admin_events").insert({actor_user_id:actor.id,target_user_id:data.user.id,target_email:email,action:"invite",details:{prenom,nom,role,departement:access.primary,departments:access.departments}});
      return res({invited:true},201);
    }

    if(action==="resend_invite"){
      const email=clean(payload.email,254).toLowerCase(),redirectTo=clean(payload.redirectTo,500);
      const {data,error}=await admin.auth.admin.generateLink({type:"invite",email,options:{redirectTo:redirectTo||undefined}});
      if(error)throw error;return res({generated:true,actionLink:data.properties?.action_link??null});
    }

    if(action==="reset_password"){
      const id=clean(payload.id,80),password=String(payload.password??"");
      if(!id||password.length<10)return res({error:"Utilisateur manquant ou mot de passe temporaire trop court."},400);
      const {data:target,error:targetError}=await admin.from("profiles").select("id,email").eq("id",id).single();
      if(targetError||!target)return res({error:"Utilisateur introuvable."},404);
      const {error}=await admin.auth.admin.updateUserById(id,{password});
      if(error)throw error;
      await admin.from("user_admin_events").insert({actor_user_id:actor.id,target_user_id:id,target_email:String(target.email??""),action:"reset_password",details:{method:"temporary_password"}});
      return res({reset:true,email:target.email});
    }

    if(action==="update"){
      const id=clean(payload.id,80),prenom=clean(payload.prenom,80),nom=clean(payload.nom,100),role=clean(payload.role,20).toLowerCase(),actif=payload.actif===true;
      if(!id||!prenom||!nom||!roles.has(role))return res({error:"Informations invalides."},400);
      const access=accessPayload(payload,role);
      const updated=await setAccess(id,prenom,nom,role,actif,access.primary,access.departments);
      await admin.auth.admin.updateUserById(id,{user_metadata:{prenom,nom,role,departement:access.primary,departments:access.departments}});
      return res({user:{...updated,departments:access.departments}});
    }

    if(action==="delete"){
      const id=clean(payload.id,80),confirmationEmail=clean(payload.confirmationEmail,254).toLowerCase();
      if(!id||id===actor.id)return res({error:"Suppression non autorisée."},400);
      const {data:before}=await admin.from("profiles").select("id,email,prenom,nom,role,departement,actif").eq("id",id).single();
      if(!before)return res({error:"Utilisateur introuvable."},404);
      const email=String(before.email??"").toLowerCase();
      if(protectedEmails.has(email)||confirmationEmail!==email)return res({error:"Compte protégé ou confirmation incorrecte."},400);
      await admin.from("deleted_user_identities").insert({former_user_id:id,email,prenom:before.prenom,nom:before.nom,role:before.role,deleted_by:actor.id});
      const {error}=await admin.auth.admin.deleteUser(id);if(error)throw error;return res({deleted:true,email});
    }

    return res({error:"Action inconnue."},400);
  }catch(error){console.error(error);return res({error:error instanceof Error?error.message:"Erreur inattendue."},400)}
});