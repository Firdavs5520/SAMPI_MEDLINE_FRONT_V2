import api from "./api.js";

const createIdempotencyKey = (prefix = "checkout") => {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomPart}`;
};

const pendingCheckoutKeys = new Map();

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const getCheckoutKey = (prefix, payload) => {
  const signature = `${prefix}:${stableStringify(payload || {})}`;
  const existing = pendingCheckoutKeys.get(signature);
  if (existing) return { signature, key: existing };

  const key = createIdempotencyKey(prefix);
  pendingCheckoutKeys.set(signature, key);
  return { signature, key };
};

const shouldKeepCheckoutKey = (error) =>
  !error?.response ||
  error?.code === "ECONNABORTED" ||
  error?.code === "ERR_NETWORK" ||
  error?.code === "ETIMEDOUT";

const usageService = {
  async useMedicine(payload) {
    const { data } = await api.post("/usage/medicine", payload);
    return data.data;
  },

  async useService(payload) {
    const { data } = await api.post("/usage/service", payload);
    return data.data;
  },

  async createCheckout(payload) {
    const { signature, key } = getCheckoutKey("nurse", payload);
    try {
      const { data } = await api.post("/usage/checkout", payload, {
        headers: {
          "X-Idempotency-Key": key
        }
      });
      pendingCheckoutKeys.delete(signature);
      return data.data;
    } catch (error) {
      if (!shouldKeepCheckoutKey(error)) {
        pendingCheckoutKeys.delete(signature);
      }
      throw error;
    }
  },

  async createLorCheckout(payload) {
    const { signature, key } = getCheckoutKey("lor", payload);
    try {
      const { data } = await api.post("/usage/lor-checkout", payload, {
        headers: {
          "X-Idempotency-Key": key
        }
      });
      pendingCheckoutKeys.delete(signature);
      return data.data;
    } catch (error) {
      if (!shouldKeepCheckoutKey(error)) {
        pendingCheckoutKeys.delete(signature);
      }
      throw error;
    }
  },

  async getLorQueueTickets({ lorIdentity = "lor1", limit = 80 } = {}) {
    const params = new URLSearchParams();
    if (lorIdentity) params.set("lorIdentity", lorIdentity);
    if (limit) params.set("limit", String(limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/usage/lor-queue-tickets${query}`);
    return data.data;
  },

  async callLorQueueTicket(ticketId, payload = {}) {
    const { data } = await api.post(`/usage/lor-queue-tickets/${ticketId}/call`, payload);
    return data.data;
  },

  async cancelLorQueueTicket(ticketId, payload = {}) {
    const { data } = await api.post(`/usage/lor-queue-tickets/${ticketId}/cancel`, payload);
    return data.data;
  },

  async getRoleSpecialists(search = "") {
    const params = new URLSearchParams();
    if (search?.trim()) {
      params.set("search", search.trim());
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/usage/specialists${query}`);
    return data.data || [];
  },

  async createRoleSpecialist(payload) {
    const { data } = await api.post("/usage/specialists", payload);
    return data.data;
  },

  async updateRoleSpecialist(id, payload) {
    const { data } = await api.patch(`/usage/specialists/${id}`, payload);
    return data.data;
  },

  async deleteRoleSpecialist(id) {
    const { data } = await api.delete(`/usage/specialists/${id}`);
    return data.data;
  },

  async getMyChecks(search = "", lorIdentity = "", specialist = null) {
    const params = new URLSearchParams();
    if (search?.trim()) {
      params.set("q", search.trim());
    }
    if (lorIdentity?.trim()) {
      params.set("lorIdentity", lorIdentity.trim().toLowerCase());
    }
    if (specialist?.id) {
      params.set("specialistId", String(specialist.id).trim());
    }
    if (specialist?.name) {
      params.set("specialistName", String(specialist.name).trim());
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/usage/my-checks${query}`);
    return data.data || [];
  }
};

export default usageService;
