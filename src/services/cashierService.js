import api from "./api.js";

const buildQuery = ({ date, department = "all", search = "" }) => {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (department) params.set("department", department);
  if (search?.trim()) params.set("search", search.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
};

const cashierService = {
  async getEntries(filters = {}) {
    const { data } = await api.get(`/cashier/entries${buildQuery(filters)}`);
    return data.data;
  },

  async getSummary(filters = {}) {
    const { data } = await api.get(`/cashier/summary${buildQuery(filters)}`);
    return data.data;
  },

  async createEntry(payload) {
    const { data } = await api.post("/cashier/entries", payload);
    return data.data;
  },

  async updateEntry(entryId, payload) {
    const { data } = await api.patch(`/cashier/entries/${entryId}`, payload);
    return data.data;
  },

  async deleteEntry(entryId) {
    const { data } = await api.delete(`/cashier/entries/${entryId}`);
    return data.data;
  }
};

export default cashierService;
