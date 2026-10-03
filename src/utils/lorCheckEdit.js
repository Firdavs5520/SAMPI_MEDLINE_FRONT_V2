// LOR chekini yaratilganidan keyin 12 soat ichida tahrirlash mumkin (backend ham shuni tekshiradi).
export const LOR_CHECK_EDIT_WINDOW_MS = 12 * 60 * 60 * 1000;

export const getLorCheckEditDeadline = (check) => {
  const createdAtMs = new Date(check?.createdAt || 0).getTime();
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
  return new Date(createdAtMs + LOR_CHECK_EDIT_WINDOW_MS);
};

export const canEditLorCheck = (check, now = Date.now()) => {
  const deadline = getLorCheckEditDeadline(check);
  return Boolean(deadline) && now < deadline.getTime();
};
