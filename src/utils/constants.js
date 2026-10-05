export const storageKeys = {
  token: "sampi_token",
  user: "sampi_user",
  lorIdentity: "sampi_lor_identity",
  lorDoctor: "sampi_lor_doctor",
  nurseSpecialist: "sampi_nurse_specialist",
  themeMode: "sampi_theme_mode"
};

export const roleHomePath = {
  nurse: "/nurse",
  lor: "/lor/select",
  delivery: "/delivery",
  manager: "/manager",
  cashier: "/cashier/lor-queue",
  reporter: "/reporter",
  tv: "/tv/lor"
};

export const roleLabels = {
  nurse: "Hamshira",
  lor: "LOR shifokor",
  delivery: "Yetkazuvchi",
  manager: "Menejer",
  cashier: "Kassir",
  reporter: "Hisobotchi",
  tv: "TV navbat"
};

// Navbardagi tugma bilan to'liq ekrandan chiqilganini bildiradi (sessiya davomida).
export const FULLSCREEN_OFF_KEY = "sampi_fullscreen_off";

export const sidebarMenus = {
  nurse: [
    { label: "Chek yaratish", path: "/nurse", end: true, icon: "grid" },
    { label: "Mening cheklarim", path: "/nurse/checks", end: true, icon: "receipt" },
    // Kam ishlatiladigan ro'yxatlar pastdagi "Sozlamalar" bo'limida.
    { label: "Hamshiralar", path: "/nurse/specialists", end: true, icon: "users", bottom: true },
    { label: "Dorilar va narxlar", path: "/nurse/medicines", icon: "pill", bottom: true },
    { label: "Xizmatlar va narxlar", path: "/nurse/services", icon: "stethoscope", bottom: true }
  ],
  lor: [
    { label: "Bemor qabuli", path: "/lor/services", end: true, icon: "stethoscope" },
    { label: "Mening cheklarim", path: "/lor/checks", end: true, icon: "receipt" },
    // bottom: menyuning pastidagi "Sozlamalar" bo'limida chiqadi.
    { label: "Doktorlar", path: "/lor/specialists", end: true, icon: "users", bottom: true },
    { label: "Xizmatlar va narxlar", path: "/lor/services/add", end: true, icon: "plus", bottom: true }
  ],
  delivery: [{ label: "Omborga dori kirimi", path: "/delivery", end: true, icon: "truck" }],
  cashier: [
    { label: "LOR navbat cheki", path: "/cashier/lor-queue", end: true, group: "LOR bo'limi", icon: "receipt" },
    { label: "LOR to'lov qabuli", path: "/cashier/lor-patients", end: true, group: "LOR bo'limi", icon: "user-plus" },
    { label: "LOR yozuvlari", path: "/cashier/lor-entries", end: true, group: "LOR bo'limi", icon: "list" },
    { label: "LOR tarixi", path: "/cashier/lor-history", end: true, group: "LOR bo'limi", icon: "history" },
    { label: "Hamshira to'lov qabuli", path: "/cashier/nurse-patients", end: true, group: "Hamshira bo'limi", icon: "user-plus" },
    { label: "Hamshira yozuvlari", path: "/cashier/nurse-entries", end: true, group: "Hamshira bo'limi", icon: "list" },
    { label: "Hamshira tarixi", path: "/cashier/nurse-history", end: true, group: "Hamshira bo'limi", icon: "history" },
    { label: "Kassa jurnali", path: "/cashier/journal", end: true, group: "Umumiy", icon: "receipt" },
    { label: "Qarzdorlar", path: "/cashier/debts", end: true, group: "Umumiy", icon: "list" },
    { label: "Xarajatlar", path: "/cashier/expenses", end: true, group: "Umumiy", icon: "wallet" },
    // Kam ishlatiladigan bandlar pastdagi "Sozlamalar" bo'limida.
    { label: "LOR shifokorlar", path: "/cashier/lor-specialists", end: true, icon: "users", bottom: true },
    { label: "Hamshiralar", path: "/cashier/nurse-specialists", end: true, icon: "users", bottom: true },
    { label: "Kassa sozlamalari", path: "/cashier/settings", end: true, icon: "settings", bottom: true }
  ],
  manager: [
    { label: "Statistika", path: "/manager", end: true, icon: "bar-chart" },
    { label: "Ombor qoldiqlari", path: "/manager/stock", icon: "box" },
    { label: "Ko'p ishlatilgan dorilar", path: "/manager/most-used", icon: "trending" },
    { label: "Dori sarfi tarixi", path: "/manager/usage-history", icon: "history" }
  ],
  reporter: [
    { label: "Kunlik hisobot", path: "/reporter", end: true, icon: "bar-chart" },
    { label: "Yillik hisobot", path: "/reporter/reports", end: true, icon: "receipt" }
  ]
};
