import api from "./api.js";

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
  }
};

export default tvService;
