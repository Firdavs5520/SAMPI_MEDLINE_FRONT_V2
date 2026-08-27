import api from "./api.js";

const createIdempotencyKey = (prefix = "stock") => {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomPart}`;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const pendingStockKeys = new Map();

const getStockOperationKey = (items) => {
  const signature = stableStringify(items || []);
  const existing = pendingStockKeys.get(signature);
  if (existing) return { signature, key: existing };
  const key = createIdempotencyKey("stock");
  pendingStockKeys.set(signature, key);
  return { signature, key };
};

const shouldKeepOperationKey = (error) =>
  !error?.response ||
  error?.code === "ECONNABORTED" ||
  error?.code === "ERR_NETWORK" ||
  error?.code === "ETIMEDOUT";

const medicineService = {
  async getAllMedicines() {
    const { data } = await api.get("/medicines");
    return data.data || [];
  },

  async addMedicine(payload) {
    const { data } = await api.post("/medicines", payload);
    return data.data;
  },

  async updateMedicine(medicineId, payload) {
    const { data } = await api.patch(`/medicines/${medicineId}`, payload);
    return data.data;
  },

  async deleteMedicine(medicineId) {
    const { data } = await api.delete(`/medicines/${medicineId}`);
    return data.data;
  },

  async increaseStock(medicineId, quantity) {
    const { data } = await api.patch(`/medicines/${medicineId}/increase`, {
      quantity
    });
    return data.data;
  },

  async increaseStockBulk(items) {
    const { signature, key } = getStockOperationKey(items);
    try {
      const { data } = await api.patch(
        "/medicines/bulk-increase",
        {
          items
        },
        {
          headers: {
            "X-Idempotency-Key": key
          }
        }
      );
      pendingStockKeys.delete(signature);
      return data.data || [];
    } catch (error) {
      if (!shouldKeepOperationKey(error)) {
        pendingStockKeys.delete(signature);
      }
      throw error;
    }
  },

  async updateStock(medicineId, stock) {
    const { data } = await api.patch(`/medicines/${medicineId}/stock`, {
      stock
    });
    return data.data;
  }
};

export default medicineService;
