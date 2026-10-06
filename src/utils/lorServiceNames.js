// LOR xizmatlari bazada ruscha nom bilan saqlangan; bu jadval o'zbekcha (va
// teskari) nomni beradi. Qabul sahifasi (UZ/RU tugmasi) va chek shuni ishlatadi.
export const LOR_SERVICE_NAME_TRANSLATIONS = [
  {
    ru: "Промывание И Удаление Серных Пробок Из Ушей",
    uz: "Quloq kiri tiqinlarini yuvish va olib tashlash"
  },
  {
    ru: "Промывание Лакун. Миндалины",
    uz: "Murtak lakunalarini yuvish"
  },
  {
    ru: "Промывание Лакун Миндалины",
    uz: "Murtak lakunalarini yuvish"
  },
  {
    ru: "Промывание Онп По Проецу",
    uz: "Burun yondosh bo'shliqlarini Proets usulida yuvish"
  },
  {
    ru: "Промывание ОНП По Проецу",
    uz: "Burun yondosh bo'shliqlarini Proets usulida yuvish"
  },
  {
    ru: "Промывание ОНП По Проетцу",
    uz: "Burun yondosh bo'shliqlarini Proets usulida yuvish"
  },
  {
    ru: "Пункция Верхнечелюстной Пазухи С Одной Стороны",
    uz: "Bir tomondan yuqori jag' bo'shlig'ini punksiya qilish"
  },
  {
    ru: "Смена Трахеостомической Трубки",
    uz: "Traxeostomik naychani almashtirish"
  },
  {
    ru: "Удаление Инородного Тела Из Лор Органов",
    uz: "LOR organlaridan yot jismni olib tashlash"
  },
  {
    ru: "Уход За Больным В Послеоперационном Периоде",
    uz: "Operatsiyadan keyingi davrda bemorni parvarish qilish"
  },
  {
    ru: "Введение Лекарственных Средств В Ухо",
    uz: "Quloqqa dori vositalarini kiritish"
  },
  {
    ru: "Зондирование Лобной Пазухи С Одной Стороны",
    uz: "Bir tomondan peshona bo'shlig'ini zondlash"
  },
  {
    ru: "Ингаляция",
    uz: "Ingalyatsiya"
  },
  {
    ru: "Компресс В Ухо",
    uz: "Quloqqa kompress"
  },
  {
    ru: "Консультация",
    uz: "Konsultatsiya"
  },
  {
    ru: "Лимфотропное Введение Лекарственных Средств",
    uz: "Limfotrop dori vositalarini kiritish"
  },
  {
    ru: "Обработка Полости Рта",
    uz: "Og'iz bo'shlig'iga ishlov berish"
  },
  {
    ru: "Осмотр Пациента В Динамике (2 Недель)",
    uz: "Bemorni dinamik kuzatish (2 hafta)"
  },
  {
    ru: "Продувание По Политцеру",
    uz: "Politser bo'yicha puflash"
  }
];

export const normalizeServiceNameKey = (value) =>
  String(value || "")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();

export const LOR_SERVICE_NAME_TRANSLATION_MAP = LOR_SERVICE_NAME_TRANSLATIONS.reduce(
  (map, translation) => {
    map.set(normalizeServiceNameKey(translation.ru), translation);
    map.set(normalizeServiceNameKey(translation.uz), translation);
    return map;
  },
  new Map()
);

// Xizmat nomini kerakli tilda qaytaradi; jadvalda bo'lmasa asl nomi.
export const translateServiceName = (name, language = "uz") => {
  const originalName = String(name || "");
  const translation = LOR_SERVICE_NAME_TRANSLATION_MAP.get(normalizeServiceNameKey(originalName));
  return translation?.[language] || originalName;
};
