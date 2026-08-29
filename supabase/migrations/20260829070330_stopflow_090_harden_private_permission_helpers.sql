-- StopFlow 0.9 — durcir le dernier helper SECURITY DEFINER avec search_path historique.
alter function private.current_department() set search_path = '';
