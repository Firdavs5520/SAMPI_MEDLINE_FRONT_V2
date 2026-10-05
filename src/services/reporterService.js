import api from "./api.js";

const reporterService = {
  async getDailyReport(date) {
    const { data } = await api.get("/reporter/daily", {
      params: { date }
    });
    return data.data;
  },

  async saveDailyRecord(payload) {
    const { data } = await api.put("/reporter/daily", payload);
    return data.data;
  },

  async getMonthlyReport(month) {
    const { data } = await api.get("/reporter/monthly", {
      params: { month }
    });
    return data.data;
  },

  // Bitta oy uchun to'liq Excel: umumiy, kunlik, mutaxassislar, xizmatlar, dorilar,
  // kassa xarajatlari, qarzdorlar va kassa yozuvlari.
  async downloadFullMonthExcel(month) {
    const response = await api.get("/reporter/monthly/full-export", {
      params: { month },
      responseType: "blob"
    });
    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sampi-oylik-${month}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async downloadMonthlyExcel(month) {
    const response = await api.get("/reporter/monthly/export", {
      params: { month },
      responseType: "blob"
    });

    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const year = String(month || "").slice(0, 4) || new Date().getFullYear();
    link.href = url;
    link.download = `sampi-reporter-${year}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};

export default reporterService;
