export const storageKeys = {
  token: "sampi_token",
  user: "sampi_user",
  lorIdentity: "sampi_lor_identity"
};

export const roleHomePath = {
  nurse: "/nurse",
  lor: "/lor/select",
  delivery: "/delivery",
  manager: "/manager",
  cashier: "/cashier/nurse-patients"
};

export const roleLabels = {
  nurse: "Hamshira",
  lor: "LOR shifokor",
  delivery: "Yetkazuvchi",
  manager: "Menejer",
  cashier: "Kassir"
};

export const sidebarMenus = {
  nurse: [
    { label: "Dorilar va xizmatlar tanlash", path: "/nurse", end: true },
    { label: "Dori qo'shish", path: "/nurse/medicines" },
    { label: "Xizmat qo'shish", path: "/nurse/services" }
  ],
  lor: [
    { label: "Mening cheklarim", path: "/lor/checks", end: true },
    { label: "Xizmatdan foydalanish", path: "/lor/services", end: true },
    { label: "Xizmat qo'shish", path: "/lor/services/add", end: true }
  ],
  delivery: [{ label: "Yetkazuvchi paneli", path: "/delivery", end: true }],
  cashier: [
    { label: "Nurse bemor qo'shish", path: "/cashier/nurse-patients", end: true, group: "Nurse bo'limi" },
    { label: "Nurse yozuvlari", path: "/cashier/nurse-entries", end: true, group: "Nurse bo'limi" },
    { label: "Nurse tarixi", path: "/cashier/nurse-history", end: true, group: "Nurse bo'limi" },
    { label: "Nurse shifokorlar", path: "/cashier/nurse-specialists", end: true, group: "Nurse bo'limi" },
    { label: "LOR bemor qo'shish", path: "/cashier/lor-patients", end: true, group: "LOR bo'limi" },
    { label: "LOR yozuvlari", path: "/cashier/lor-entries", end: true, group: "LOR bo'limi" },
    { label: "LOR tarixi", path: "/cashier/lor-history", end: true, group: "LOR bo'limi" },
    { label: "LOR shifokorlar", path: "/cashier/lor-specialists", end: true, group: "LOR bo'limi" },
    { label: "Kassa jurnali", path: "/cashier/journal", end: true, group: "Umumiy" }
  ],
  manager: [
    { label: "Umumiy statistika", path: "/manager", end: true },
    { label: "Ombor qoldiqlari", path: "/manager/stock" },
    { label: "Ko'p ishlatilgan dorilar", path: "/manager/most-used" },
    { label: "Dori sarfi tarixi", path: "/manager/usage-history" }
  ]
};
