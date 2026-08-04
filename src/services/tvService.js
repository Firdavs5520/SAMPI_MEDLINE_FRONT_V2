import api, { apiBaseURL } from "./api.js";
import { storageKeys } from "../utils/constants.js";

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

  openLorQueueStream({ lorIdentity = "lor1", limit = 1 } = {}) {
    const token = localStorage.getItem(storageKeys.token);
    const url = new URL(`${apiBaseURL}/tv/lor-queue/stream`);
    if (lorIdentity) url.searchParams.set("lorIdentity", lorIdentity);
    if (limit) url.searchParams.set("limit", String(limit));
    if (token) url.searchParams.set("token", token);
    return new EventSource(url.toString());
  }
};

export default tvService;
