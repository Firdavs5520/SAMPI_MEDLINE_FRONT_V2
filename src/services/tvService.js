import api, { apiBaseURL } from "./api.js";
let streamTokenCache = {
  token: "",
  expiresAt: 0
};

const STREAM_TOKEN_REFRESH_SKEW_MS = 30000;

const getStreamToken = async () => {
  const now = Date.now();
  if (streamTokenCache.token && streamTokenCache.expiresAt - STREAM_TOKEN_REFRESH_SKEW_MS > now) {
    return streamTokenCache.token;
  }

  const { data } = await api.get("/tv/lor-queue/stream-token");
  const payload = data.data || {};
  streamTokenCache = {
    token: payload.token || "",
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt).getTime() : now
  };

  return streamTokenCache.token;
};

const tvService = {
  async setLorCurrentPatient(payload) {
    const { data } = await api.post("/tv/lor-current", payload);
    return data.data;
  },

  async getLorQueue({ lorIdentity = "all", limit = 16 } = {}, signal) {
    const params = new URLSearchParams();
    if (lorIdentity) params.set("lorIdentity", lorIdentity);
    if (limit) params.set("limit", String(limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/tv/lor-queue${query}`, { signal });
    return data.data;
  },

  async openLorQueueStream({ lorIdentity = "lor1", limit = 1 } = {}) {
    const streamToken = await getStreamToken();
    const url = new URL(`${apiBaseURL}/tv/lor-queue/stream`);
    if (lorIdentity) url.searchParams.set("lorIdentity", lorIdentity);
    if (limit) url.searchParams.set("limit", String(limit));
    if (streamToken) url.searchParams.set("streamToken", streamToken);
    return new EventSource(url.toString());
  }
};

export default tvService;
