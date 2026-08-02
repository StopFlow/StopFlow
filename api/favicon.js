/* StopFlow — aucune icône de navigateur définie pour le moment. */

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.statusCode = 204;
  res.end();
};
