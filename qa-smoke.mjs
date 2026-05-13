import { chromium, devices } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173";
const ROLE_ORDER = ["nurse", "lor", "delivery", "manager", "cashier"];

const nowIso = () => new Date().toISOString();

const state = {
  idCounters: {
    medicine: 3,
    service: 5,
    specialist: 5,
    check: 3,
    entry: 2,
    usage: 2
  },
  medicines: [
    { _id: "med1", name: "Paracetamol", price: 5000, stock: 40, createdAt: nowIso() },
    { _id: "med2", name: "Ibuprofen", price: 7000, stock: 18, createdAt: nowIso() },
    { _id: "med3", name: "Ceftriaxone", price: 14000, stock: 9, createdAt: nowIso() }
  ],
  services: [
    {
      _id: "srv1",
      name: "Ukol qilish",
      type: "nurse",
      priceOptions: { first: 12000, second: 15000, third: 18000 },
      createdBy: { userId: "nurse-user-1", name: "Malika Nurse" },
      createdAt: nowIso()
    },
    {
      _id: "srv2",
      name: "Sistem qo'yish",
      type: "nurse",
      priceOptions: { first: 22000, second: 25000, third: 28000 },
      createdBy: { userId: "nurse-user-1", name: "Malika Nurse" },
      createdAt: nowIso()
    },
    {
      _id: "srv3",
      name: "Burun chayish",
      type: "lor",
      price: 23000,
      createdBy: { userId: "lor-user-1", name: "Aziz Lor" },
      createdAt: nowIso()
    },
    {
      _id: "srv4",
      name: "Quloq tozalash",
      type: "lor",
      price: 32000,
      createdBy: { userId: "lor-user-1", name: "Aziz Lor" },
      createdAt: nowIso()
    }
  ],
  specialists: [
    { _id: "sp1", name: "Malika Nurse", type: "nurse", createdAt: nowIso() },
    { _id: "sp2", name: "Dilnoza Nurse", type: "nurse", createdAt: nowIso() },
    { _id: "sp3", name: "Aziz Lor", type: "lor", createdAt: nowIso() },
    { _id: "sp4", name: "Sherzod Lor", type: "lor", createdAt: nowIso() }
  ],
  checks: [
    {
      _id: "chk1",
      checkId: "CHK-1001",
      type: "mixed",
      patient: { firstName: "Test", lastName: "Patient", fullName: "Test Patient" },
      items: [
        { name: "Paracetamol", quantity: 1, price: 5000, itemType: "medicine" },
        { name: "Ukol qilish", quantity: 1, price: 12000, itemType: "service" }
      ],
      total: 17000,
      creatorRole: "nurse",
      creatorName: "Malika Nurse",
      lorIdentity: "",
      createdBy: { role: "nurse", name: "Malika Nurse" },
      createdAt: nowIso(),
      cashierStatus: { accepted: false, paidAmount: 0, debtAmount: 17000, paymentMethod: "cash" }
    },
    {
      _id: "chk2",
      checkId: "CHK-1002",
      type: "service",
      patient: { firstName: "Lola", lastName: "Aliyeva", fullName: "Lola Aliyeva" },
      items: [{ name: "Burun chayish", quantity: 1, price: 23000, itemType: "service" }],
      total: 23000,
      creatorRole: "lor",
      creatorName: "Aziz Lor",
      lorIdentity: "lor1",
      createdBy: { role: "lor", name: "Aziz Lor", lorIdentity: "lor1" },
      createdAt: nowIso(),
      cashierStatus: { accepted: false, paidAmount: 0, debtAmount: 23000, paymentMethod: "cash" }
    }
  ],
  entries: [
    {
      _id: "ent1",
      patientName: "Eski Bemor",
      amount: 50000,
      paidAmount: 50000,
      debtAmount: 0,
      paymentMethod: "cash",
      specialistName: "Aziz Lor",
      specialistType: "lor",
      department: "lor",
      patientPhone: "",
      note: "",
      createdAt: nowIso()
    }
  ],
  usageHistory: [
    {
      _id: "use1",
      medicineId: { _id: "med1", name: "Paracetamol" },
      quantity: 1,
      usedBy: { name: "Malika Nurse", role: "nurse" },
      usedAt: nowIso()
    }
  ]
};

function makeId(prefix, key) {
  state.idCounters[key] += 1;
  return `${prefix}${state.idCounters[key]}`;
}

function parseRoleFromAuth(headers) {
  const auth = String(headers.authorization || headers.Authorization || "");
  const token = auth.replace(/^Bearer\s+/i, "");
  return ROLE_ORDER.find((role) => token.startsWith(role)) || "nurse";
}

function parseUserIdForRole(role) {
  return `${role}-user-1`;
}

function fullNameFromPatient(patient) {
  if (!patient) return "-";
  if (patient.fullName) return patient.fullName;
  return `${String(patient.firstName || "").trim()} ${String(patient.lastName || "").trim()}`.trim();
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildEntriesPayload(entries) {
  return {
    entries,
    shift: {
      fromLabel: "08:00",
      toLabel: "02:00"
    }
  };
}

function buildSummary(entries) {
  const totalAmount = entries.reduce((sum, e) => sum + safeNum(e.amount), 0);
  const totalPaidAmount = entries.reduce((sum, e) => sum + safeNum(e.paidAmount), 0);
  const totalDebtAmount = entries.reduce((sum, e) => sum + safeNum(e.debtAmount), 0);
  const nurseCount = entries.filter((e) => String(e.specialistType || "").toLowerCase() === "nurse").length;
  const lorCount = entries.filter((e) => String(e.specialistType || "").toLowerCase() === "lor").length;

  return {
    totalAmount,
    totalPaidAmount,
    totalDebtAmount,
    totalEntries: entries.length,
    bySpecialistType: {
      nurse: { count: nurseCount },
      lor: { count: lorCount }
    }
  };
}

function getServicePrice(service, tier = "first") {
  if (service?.priceOptions && safeNum(service.priceOptions.first) > 0) {
    return safeNum(service.priceOptions[tier] ?? service.priceOptions.first);
  }
  return safeNum(service?.price);
}

function makeCheckId() {
  return `CHK-${1000 + state.idCounters.check}`;
}

function createCheck({ role, patient, specialistName, lorIdentity = "", medicines = [], services = [] }) {
  const checkId = makeId("chk", "check");
  const code = makeCheckId();

  const medicineItems = medicines.map((item) => {
    const med = state.medicines.find((m) => m._id === item.medicineId);
    const quantity = Math.max(1, safeNum(item.quantity, 1));
    const price = safeNum(med?.price);

    if (med) {
      med.stock = Math.max(0, safeNum(med.stock) - quantity);
      state.usageHistory.push({
        _id: makeId("use", "usage"),
        medicineId: { _id: med._id, name: med.name },
        quantity,
        usedBy: { name: specialistName || "-", role },
        usedAt: nowIso()
      });
    }

    return {
      name: med?.name || "Unknown medicine",
      quantity,
      price,
      itemType: "medicine"
    };
  });

  const serviceItems = services.map((item) => {
    const svc = state.services.find((s) => s._id === item.serviceId);
    const quantity = Math.max(1, safeNum(item.quantity, 1));
    const tier = String(item.priceTier || "first");
    const price = getServicePrice(svc, tier);

    return {
      name: svc?.name || "Unknown service",
      quantity,
      price,
      itemType: "service"
    };
  });

  const items = [...medicineItems, ...serviceItems];
  const total = items.reduce((sum, item) => sum + safeNum(item.price) * safeNum(item.quantity), 0);
  const fullName = fullNameFromPatient(patient);

  const check = {
    _id: checkId,
    checkId: code,
    type: medicineItems.length && serviceItems.length ? "mixed" : medicineItems.length ? "medicine" : "service",
    patient: {
      firstName: String(patient?.firstName || "").trim(),
      lastName: String(patient?.lastName || "").trim(),
      fullName
    },
    items,
    total,
    creatorRole: role,
    creatorName: specialistName || "-",
    lorIdentity: role === "lor" ? String(lorIdentity || "").toLowerCase() : "",
    createdBy:
      role === "lor"
        ? { role: "lor", name: specialistName || "-", lorIdentity: String(lorIdentity || "").toLowerCase() }
        : { role: "nurse", name: specialistName || "-" },
    createdAt: nowIso(),
    cashierStatus: {
      accepted: false,
      paidAmount: 0,
      debtAmount: total,
      paymentMethod: "cash"
    }
  };

  state.checks.unshift(check);
  return check;
}

function filterChecksByRole(role, lorIdentity = "") {
  if (role === "nurse") {
    return state.checks.filter((c) => c.creatorRole === "nurse");
  }

  if (role === "lor") {
    const normalized = String(lorIdentity || "").trim().toLowerCase();
    return state.checks.filter((c) => {
      if (c.creatorRole !== "lor") return false;
      if (!normalized) return true;
      return String(c.lorIdentity || "").toLowerCase() === normalized;
    });
  }

  return state.checks;
}

function getPendingChecks(roleFilter, search = "") {
  const q = String(search || "").trim().toLowerCase();
  const normalizedRole = String(roleFilter || "all").toLowerCase();

  return state.checks
    .filter((check) => !check.cashierStatus?.accepted)
    .filter((check) => {
      if (normalizedRole === "all") return true;
      return String(check.creatorRole || "").toLowerCase() === normalizedRole;
    })
    .map((check) => ({
      _id: check._id,
      checkId: check.checkId,
      patientName: check.patient?.fullName || "-",
      total: check.total,
      creatorRole: check.creatorRole,
      creatorName: check.creatorName,
      lorIdentity: check.lorIdentity || "",
      createdAt: check.createdAt
    }))
    .filter((item) => !q || `${item.checkId} ${item.patientName} ${item.creatorName}`.toLowerCase().includes(q));
}

function aggregateMostUsed() {
  const bucket = new Map();
  for (const usage of state.usageHistory) {
    const name = usage?.medicineId?.name || "-";
    const prev = bucket.get(name) || { medicineName: name, totalUsedQuantity: 0, usageCount: 0 };
    prev.totalUsedQuantity += safeNum(usage.quantity);
    prev.usageCount += 1;
    bucket.set(name, prev);
  }
  return Array.from(bucket.values()).sort((a, b) => b.totalUsedQuantity - a.totalUsedQuantity);
}

function buildOverview(period = "today") {
  const checks = state.checks;

  const getRoleStats = (role) => {
    const roleChecks = checks.filter((c) => c.creatorRole === role);
    const totalRevenue = roleChecks.reduce((sum, c) => sum + safeNum(c.total), 0);
    const checksCount = roleChecks.length;

    const medicineNames = new Set();
    const itemAgg = new Map();

    for (const check of roleChecks) {
      for (const item of check.items || []) {
        if (item.itemType === "medicine") medicineNames.add(item.name);
        const key = `${item.itemType}:${item.name}`;
        const prev = itemAgg.get(key) || { name: item.name, itemType: item.itemType, totalQuantity: 0 };
        prev.totalQuantity += safeNum(item.quantity);
        itemAgg.set(key, prev);
      }
    }

    let topItem = null;
    for (const value of itemAgg.values()) {
      if (!topItem || value.totalQuantity > topItem.totalQuantity) {
        topItem = value;
      }
    }

    return {
      totalRevenue,
      checksCount,
      medicineTypesCount: medicineNames.size,
      topItem
    };
  };

  const nurse = getRoleStats("nurse");
  const lor = getRoleStats("lor");
  const totalRevenue = nurse.totalRevenue + lor.totalRevenue;
  const checksCount = nurse.checksCount + lor.checksCount;
  const medicineTypesCount = new Set(
    checks.flatMap((c) => (c.items || []).filter((i) => i.itemType === "medicine").map((i) => i.name))
  ).size;

  const totalTopBucket = new Map();
  for (const check of checks) {
    for (const item of check.items || []) {
      const key = `${item.itemType}:${item.name}`;
      const prev = totalTopBucket.get(key) || { name: item.name, itemType: item.itemType, totalQuantity: 0 };
      prev.totalQuantity += safeNum(item.quantity);
      totalTopBucket.set(key, prev);
    }
  }
  let totalTopItem = null;
  for (const value of totalTopBucket.values()) {
    if (!totalTopItem || value.totalQuantity > totalTopItem.totalQuantity) {
      totalTopItem = value;
    }
  }

  const lor1Checks = checks.filter((c) => c.creatorRole === "lor" && String(c.lorIdentity).toLowerCase() === "lor1");
  const lor2Checks = checks.filter((c) => c.creatorRole === "lor" && String(c.lorIdentity).toLowerCase() === "lor2");

  return {
    period,
    inventoryMedicineTypes: state.medicines.length,
    roles: { nurse, lor },
    lorIdentities: {
      lor1: {
        totalRevenue: lor1Checks.reduce((sum, c) => sum + safeNum(c.total), 0),
        checksCount: lor1Checks.length
      },
      lor2: {
        totalRevenue: lor2Checks.reduce((sum, c) => sum + safeNum(c.total), 0),
        checksCount: lor2Checks.length
      }
    },
    total: {
      totalRevenue,
      checksCount,
      medicineTypesCount,
      topItem: totalTopItem
    }
  };
}

function toJsonResponse(data, status = 200) {
  const isError = status >= 400;
  const message =
    isError && data && typeof data === "object" && "message" in data ? String(data.message || "") : undefined;

  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ success: status < 400, message, data })
  };
}

async function installMockApi(context) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/api$/, "").replace(/^.*\/api/, "");
    const method = request.method().toUpperCase();
    const role = parseRoleFromAuth(request.headers());

    let payload = {};
    if (method !== "GET" && method !== "HEAD") {
      try {
        payload = request.postDataJSON() || {};
      } catch {
        payload = {};
      }
    }

    try {
      if (path === "/auth/login" && method === "POST") {
        const email = String(payload.email || "").toLowerCase();
        const guessedRole = email.includes("lor")
          ? "lor"
          : email.includes("cash")
            ? "cashier"
            : email.includes("manager")
              ? "manager"
              : email.includes("delivery")
                ? "delivery"
                : "nurse";

        const userMap = {
          nurse: { _id: "nurse-user-1", id: "nurse-user-1", role: "nurse", name: "Malika Nurse" },
          lor: { _id: "lor-user-1", id: "lor-user-1", role: "lor", name: "Aziz Lor" },
          cashier: { _id: "cashier-user-1", id: "cashier-user-1", role: "cashier", name: "Cashier User" },
          manager: { _id: "manager-user-1", id: "manager-user-1", role: "manager", name: "Manager User" },
          delivery: { _id: "delivery-user-1", id: "delivery-user-1", role: "delivery", name: "Delivery User" }
        };

        return route.fulfill(toJsonResponse({ token: `${guessedRole}-token`, user: userMap[guessedRole] }));
      }

      if (path === "/medicines" && method === "GET") {
        return route.fulfill(toJsonResponse(state.medicines));
      }

      if (path === "/medicines" && method === "POST") {
        const created = {
          _id: makeId("med", "medicine"),
          name: String(payload.name || "Yangi dori").trim(),
          price: safeNum(payload.price, 0),
          stock: 0,
          createdAt: nowIso()
        };
        state.medicines.push(created);
        return route.fulfill(toJsonResponse(created));
      }

      if (path === "/medicines/bulk-increase" && method === "PATCH") {
        const items = Array.isArray(payload.items) ? payload.items : [];
        for (const item of items) {
          const med = state.medicines.find((m) => m._id === item.medicineId);
          if (!med) continue;
          med.stock = safeNum(med.stock) + Math.max(0, safeNum(item.quantity));
        }
        return route.fulfill(toJsonResponse(items));
      }

      if (path.match(/^\/medicines\/[^/]+$/) && method === "PATCH") {
        const id = path.split("/")[2];
        const med = state.medicines.find((m) => m._id === id);
        if (!med) return route.fulfill(toJsonResponse({ message: "Not found" }, 404));
        med.name = payload.name ? String(payload.name) : med.name;
        if (payload.price != null) med.price = safeNum(payload.price, med.price);
        return route.fulfill(toJsonResponse(med));
      }

      if (path.match(/^\/medicines\/[^/]+$/) && method === "DELETE") {
        const id = path.split("/")[2];
        const idx = state.medicines.findIndex((m) => m._id === id);
        if (idx >= 0) state.medicines.splice(idx, 1);
        return route.fulfill(toJsonResponse({ archived: false }));
      }

      if (path.match(/^\/medicines\/[^/]+\/increase$/) && method === "PATCH") {
        const id = path.split("/")[2];
        const med = state.medicines.find((m) => m._id === id);
        if (med) med.stock = safeNum(med.stock) + Math.max(0, safeNum(payload.quantity));
        return route.fulfill(toJsonResponse(med || null));
      }

      if (path.match(/^\/medicines\/[^/]+\/stock$/) && method === "PATCH") {
        const id = path.split("/")[2];
        const med = state.medicines.find((m) => m._id === id);
        if (med) med.stock = Math.max(0, safeNum(payload.stock));
        return route.fulfill(toJsonResponse(med || null));
      }

      if (path === "/services" && method === "GET") {
        return route.fulfill(toJsonResponse(state.services));
      }

      if (path === "/services" && method === "POST") {
        const roleUserId = parseUserIdForRole(role);
        const created = {
          _id: makeId("srv", "service"),
          name: String(payload.name || "Yangi xizmat").trim(),
          type: String(payload.type || (role === "lor" ? "lor" : "nurse")),
          price: payload.price != null ? safeNum(payload.price) : safeNum(payload.priceOptions?.first),
          priceOptions: payload.priceOptions || undefined,
          createdBy: { userId: roleUserId, name: role === "lor" ? "Aziz Lor" : "Malika Nurse" },
          createdAt: nowIso()
        };
        state.services.push(created);
        return route.fulfill(toJsonResponse(created));
      }

      if (path.match(/^\/services\/[^/]+$/) && method === "PATCH") {
        const id = path.split("/")[2];
        const svc = state.services.find((s) => s._id === id);
        if (!svc) return route.fulfill(toJsonResponse({ message: "Not found" }, 404));
        if (payload.name != null) svc.name = String(payload.name);
        if (payload.type != null) svc.type = String(payload.type);
        if (payload.price != null) svc.price = safeNum(payload.price);
        if (payload.priceOptions != null) {
          svc.priceOptions = payload.priceOptions;
          svc.price = safeNum(payload.priceOptions?.first, svc.price);
        }
        return route.fulfill(toJsonResponse(svc));
      }

      if (path.match(/^\/services\/[^/]+$/) && method === "DELETE") {
        const id = path.split("/")[2];
        const idx = state.services.findIndex((s) => s._id === id);
        if (idx >= 0) state.services.splice(idx, 1);
        return route.fulfill(toJsonResponse({ deleted: true }));
      }

      if (path === "/usage/specialists" && method === "GET") {
        const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
        const filtered = state.specialists
          .filter((s) => (role === "lor" ? s.type === "lor" : role === "nurse" ? s.type === "nurse" : true))
          .filter((s) => !search || String(s.name).toLowerCase().includes(search));
        return route.fulfill(toJsonResponse(filtered));
      }

      if (path === "/usage/specialists" && method === "POST") {
        const created = {
          _id: makeId("sp", "specialist"),
          name: String(payload.name || "Yangi mutaxassis").trim(),
          type: role === "lor" ? "lor" : "nurse",
          createdAt: nowIso()
        };
        state.specialists.push(created);
        return route.fulfill(toJsonResponse(created));
      }

      if (path.match(/^\/usage\/specialists\/[^/]+$/) && method === "PATCH") {
        const id = path.split("/")[3];
        const sp = state.specialists.find((s) => s._id === id);
        if (sp && payload.name != null) sp.name = String(payload.name).trim();
        return route.fulfill(toJsonResponse(sp || null));
      }

      if (path.match(/^\/usage\/specialists\/[^/]+$/) && method === "DELETE") {
        const id = path.split("/")[3];
        const idx = state.specialists.findIndex((s) => s._id === id);
        if (idx >= 0) state.specialists.splice(idx, 1);
        return route.fulfill(toJsonResponse({ deleted: true }));
      }

      if (path === "/usage/my-checks" && method === "GET") {
        const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
        const lorIdentity = String(url.searchParams.get("lorIdentity") || "");
        const checks = filterChecksByRole(role, lorIdentity).filter((check) => {
          if (!q) return true;
          return `${check.patient?.fullName || ""} ${check.checkId || ""}`.toLowerCase().includes(q);
        });
        return route.fulfill(toJsonResponse(checks));
      }

      if (path === "/usage/checkout" && method === "POST") {
        const check = createCheck({
          role: "nurse",
          patient: payload.patient,
          specialistName: String(payload.specialistName || "Malika Nurse"),
          medicines: Array.isArray(payload.medicines) ? payload.medicines : [],
          services: Array.isArray(payload.services) ? payload.services : []
        });
        return route.fulfill(toJsonResponse({ check }));
      }

      if (path === "/usage/lor-checkout" && method === "POST") {
        const check = createCheck({
          role: "lor",
          patient: payload.patient,
          specialistName: String(payload.specialistName || "Aziz Lor"),
          lorIdentity: String(payload.lorIdentity || "lor1"),
          medicines: [],
          services: Array.isArray(payload.services) ? payload.services : []
        });
        return route.fulfill(toJsonResponse({ check }));
      }

      if (path === "/cashier/pending-checks" && method === "GET") {
        const roleFilter = url.searchParams.get("role") || "all";
        const search = url.searchParams.get("search") || "";
        return route.fulfill(toJsonResponse(getPendingChecks(roleFilter, search)));
      }

      if (path === "/cashier/specialists" && method === "GET") {
        const type = String(url.searchParams.get("type") || "all").toLowerCase();
        const search = String(url.searchParams.get("search") || "").toLowerCase();
        const filtered = state.specialists
          .filter((s) => (type === "all" ? true : s.type === type))
          .filter((s) => !search || s.name.toLowerCase().includes(search));
        return route.fulfill(toJsonResponse(filtered));
      }

      if (path === "/cashier/specialists" && method === "POST") {
        const created = {
          _id: makeId("sp", "specialist"),
          type: String(payload.type || "nurse"),
          name: String(payload.name || "Yangi").trim(),
          createdAt: nowIso()
        };
        state.specialists.push(created);
        return route.fulfill(toJsonResponse(created));
      }

      if (path.match(/^\/cashier\/specialists\/[^/]+$/) && method === "DELETE") {
        const id = path.split("/")[3];
        const idx = state.specialists.findIndex((s) => s._id === id);
        if (idx >= 0) state.specialists.splice(idx, 1);
        return route.fulfill(toJsonResponse({ deleted: true }));
      }

      if (path === "/cashier/entries" && method === "GET") {
        const department = String(url.searchParams.get("department") || "all").toLowerCase();
        const specialistType = String(url.searchParams.get("specialistType") || "all").toLowerCase();
        const paymentMethod = String(url.searchParams.get("paymentMethod") || "all").toLowerCase();
        const debtOnly = String(url.searchParams.get("debtOnly") || "false") === "true";
        const search = String(url.searchParams.get("search") || "").trim().toLowerCase();

        let entries = [...state.entries];
        if (department !== "all") entries = entries.filter((e) => String(e.department || "").toLowerCase() === department);
        if (specialistType !== "all") entries = entries.filter((e) => String(e.specialistType || "").toLowerCase() === specialistType);
        if (paymentMethod !== "all") entries = entries.filter((e) => String(e.paymentMethod || "").toLowerCase() === paymentMethod);
        if (debtOnly) entries = entries.filter((e) => safeNum(e.debtAmount) > 0);
        if (search) entries = entries.filter((e) => `${e.patientName} ${e.specialistName} ${e.patientPhone}`.toLowerCase().includes(search));

        return route.fulfill(toJsonResponse(buildEntriesPayload(entries)));
      }

      if (path === "/cashier/summary" && method === "GET") {
        const department = String(url.searchParams.get("department") || "all").toLowerCase();
        const specialistType = String(url.searchParams.get("specialistType") || "all").toLowerCase();
        const paymentMethod = String(url.searchParams.get("paymentMethod") || "all").toLowerCase();
        const debtOnly = String(url.searchParams.get("debtOnly") || "false") === "true";
        const search = String(url.searchParams.get("search") || "").trim().toLowerCase();

        let entries = [...state.entries];
        if (department !== "all") entries = entries.filter((e) => String(e.department || "").toLowerCase() === department);
        if (specialistType !== "all") entries = entries.filter((e) => String(e.specialistType || "").toLowerCase() === specialistType);
        if (paymentMethod !== "all") entries = entries.filter((e) => String(e.paymentMethod || "").toLowerCase() === paymentMethod);
        if (debtOnly) entries = entries.filter((e) => safeNum(e.debtAmount) > 0);
        if (search) entries = entries.filter((e) => `${e.patientName} ${e.specialistName} ${e.patientPhone}`.toLowerCase().includes(search));

        return route.fulfill(toJsonResponse(buildSummary(entries)));
      }

      if (path === "/cashier/entries" && method === "POST") {
        const checkRef = String(payload.checkRef || "");
        const check = state.checks.find((c) => c._id === checkRef);
        if (!check) return route.fulfill(toJsonResponse({ message: "Check not found" }, 404));

        const total = safeNum(check.total);
        const paidAmount = Math.max(0, Math.min(total, safeNum(payload.paidAmount)));
        const debtAmount = Math.max(0, total - paidAmount);

        check.cashierStatus = {
          accepted: true,
          paidAmount,
          debtAmount,
          paymentMethod: String(payload.paymentMethod || "cash")
        };

        const createdEntry = {
          _id: makeId("ent", "entry"),
          patientName: check.patient?.fullName || "-",
          amount: total,
          paidAmount,
          debtAmount,
          paymentMethod: String(payload.paymentMethod || "cash"),
          specialistName: check.creatorName || "-",
          specialistType: check.creatorRole || "nurse",
          department: check.creatorRole || "nurse",
          patientPhone: String(payload.patientPhone || ""),
          note: String(payload.note || ""),
          createdAt: nowIso()
        };

        state.entries.unshift(createdEntry);
        return route.fulfill(toJsonResponse(createdEntry));
      }

      if (path.match(/^\/cashier\/entries\/[^/]+$/) && method === "PATCH") {
        const id = path.split("/")[3];
        const entry = state.entries.find((e) => e._id === id);
        if (!entry) return route.fulfill(toJsonResponse({ message: "Entry not found" }, 404));

        const total = safeNum(entry.amount);
        const paidAmount = Math.max(0, Math.min(total, safeNum(payload.paidAmount, entry.paidAmount)));
        entry.paidAmount = paidAmount;
        entry.debtAmount = Math.max(0, total - paidAmount);
        entry.paymentMethod = String(payload.paymentMethod || entry.paymentMethod || "cash");
        entry.note = String(payload.note || entry.note || "");
        return route.fulfill(toJsonResponse(entry));
      }

      if (path.match(/^\/cashier\/entries\/[^/]+$/) && method === "DELETE") {
        const id = path.split("/")[3];
        const idx = state.entries.findIndex((e) => e._id === id);
        if (idx >= 0) state.entries.splice(idx, 1);
        return route.fulfill(toJsonResponse({ deleted: true }));
      }

      if (path === "/reports/current-stock" && method === "GET") {
        return route.fulfill(toJsonResponse(state.medicines.map((m) => ({ name: m.name, stock: m.stock }))));
      }

      if (path === "/reports/most-used-medicines" && method === "GET") {
        return route.fulfill(toJsonResponse(aggregateMostUsed()));
      }

      if (path === "/reports/medicine-usage" && method === "GET") {
        return route.fulfill(toJsonResponse(state.usageHistory));
      }

      if (path === "/reports/overview" && method === "GET") {
        const period = String(url.searchParams.get("period") || "today");
        return route.fulfill(toJsonResponse(buildOverview(period)));
      }

      if (path === "/reports/revenue" && method === "GET") {
        const totalRevenue = state.entries.reduce((sum, e) => sum + safeNum(e.paidAmount), 0);
        return route.fulfill(toJsonResponse({ totalRevenue, checksCount: state.checks.length, period: "all" }));
      }

      if (path === "/reports/checks" && method === "GET") {
        return route.fulfill(toJsonResponse(state.checks));
      }

      return route.fulfill(toJsonResponse({ notice: `Unhandled mock route ${method} ${path}` }, 200));
    } catch (err) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: err?.message || "Mock server error" })
      });
    }
  });
}

function attachErrorCollectors(page, bucket, prefix) {
  const isIgnorableResource = (url) =>
    /fonts\.(gstatic|googleapis)\.com/i.test(url) ||
    /\/(apple-touch-icon.*|favicon\.ico)$/i.test(url);

  const isIgnorableConsoleError = (text) =>
    /Failed to load resource: the server responded with a status of 404 \(Not Found\)/i.test(text);

  page.on("pageerror", (err) => bucket.push(`${prefix} pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    bucket.push(`${prefix} console error: ${text}`);
  });
  page.on("requestfailed", (req) => {
    if (isIgnorableResource(req.url())) return;
    bucket.push(`${prefix} requestfailed: ${req.method()} ${req.url()} -> ${req.failure()?.errorText || "failed"}`);
  });
}

async function authContext(browser, role, options = {}, authOptions = {}) {
  const context = await browser.newContext(options);
  await installMockApi(context);
  const lorIdentityValue =
    role === "lor" ? String(authOptions.lorIdentity || "lor1").trim().toLowerCase() || "lor1" : "";

  const userMap = {
    nurse: { _id: "nurse-user-1", id: "nurse-user-1", role: "nurse", name: "Malika Nurse" },
    lor: {
      _id: authOptions.userId || "lor-user-1",
      id: authOptions.userId || "lor-user-1",
      role: "lor",
      name: authOptions.userName || (lorIdentityValue === "lor2" ? "Sherzod Lor" : "Aziz Lor")
    },
    cashier: { _id: "cashier-user-1", id: "cashier-user-1", role: "cashier", name: "Cashier User" },
    manager: { _id: "manager-user-1", id: "manager-user-1", role: "manager", name: "Manager User" },
    delivery: { _id: "delivery-user-1", id: "delivery-user-1", role: "delivery", name: "Delivery User" }
  };

  await context.addInitScript(
    ({ roleValue, user, lorIdentity }) => {
      localStorage.setItem("sampi_token", `${roleValue}-token`);
      localStorage.setItem("sampi_user", JSON.stringify(user));
      if (roleValue === "lor") {
        sessionStorage.setItem("sampi_lor_identity", lorIdentity || "lor1");
      } else {
        sessionStorage.removeItem("sampi_lor_identity");
      }
    },
    { roleValue: role, user: userMap[role], lorIdentity: lorIdentityValue }
  );

  return context;
}

async function withScenario(name, fn, results) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started, details: [] });
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - started, details: [err?.message || String(err)] });
  }
}

async function scenarioLoginFlow(browser) {
  const context = await browser.newContext();
  await installMockApi(context);
  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, "login");

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Sampi Medline/i }).waitFor();

  await page.getByLabel("Email").fill("nurse@mail.com");
  await page.getByLabel("Parol").fill("123456");
  await page.getByRole("button", { name: "Kirish" }).click();

  await page.waitForURL(/\/nurse$/, { timeout: 10000 });
  await page.getByText("Hamshira paneli").waitFor({ timeout: 10000 });

  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioMobileLoginLayout(browser) {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await installMockApi(context);
  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, "mobile-login");

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Sampi Medline/i }).waitFor();
  await page.getByRole("button", { name: "Kirish" }).waitFor();
  if (!(await page.getByRole("button", { name: "Kirish" }).isVisible())) {
    throw new Error("Mobil login tugmasi ko'rinmadi");
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioNurseCheckoutPrint(browser) {
  const context = await authContext(browser, "nurse");
  await context.addInitScript(() => {
    window.__printWrites = [];
    window.open = (...args) => {
      let html = "";
      return {
        closed: false,
        document: {
          open() {},
          write(content) {
            html += String(content || "");
          },
          close() {
            window.__printWrites.push({ html, args });
          }
        },
        close() {
          this.closed = true;
        }
      };
    };
  });

  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, "nurse-print");

  await page.goto(`${BASE_URL}/nurse`, { waitUntil: "domcontentloaded" });
  await page.getByText("Hamshira paneli").waitFor();

  await page.getByRole("button", { name: "Keyingi: Bemor" }).first().click();
  await page.getByLabel("Bemor F.I.O").fill("Ali Valiyev");
  await page.getByRole("button", { name: "Keyingi: Dorilar" }).first().click();
  await page.getByRole("button", { name: "Skip" }).first().click();
  await page.getByRole("button", { name: /Ukol qilish/ }).first().click();
  await page.getByRole("button", { name: "Keyingi" }).first().click();
  await page.getByText("5-qadam: Chek preview").waitFor();
  await page.getByRole("button", { name: /Chek chiqarish/ }).first().click();
  await page.getByText("Chek muvaffaqiyatli yaratildi.").waitFor({ timeout: 10000 });

  const printWrites = await page.evaluate(() => window.__printWrites || []);
  const hasPrintedHtml = printWrites.some(
    (entry) => String(entry.html).includes("SAMPI MEDLINE") && String(entry.html).includes("Ali Valiyev")
  );
  if (!hasPrintedHtml) throw new Error("Nurse checkout print HTML topilmadi");
  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioLorCheckoutPrint(browser) {
  const context = await authContext(browser, "lor");
  await context.addInitScript(() => {
    window.__printWrites = [];
    window.open = (...args) => {
      let html = "";
      return {
        closed: false,
        document: {
          open() {},
          write(content) {
            html += String(content || "");
          },
          close() {
            window.__printWrites.push({ html, args });
          }
        },
        close() {
          this.closed = true;
        }
      };
    };
  });

  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, "lor-print");

  await page.goto(`${BASE_URL}/lor/services`, { waitUntil: "domcontentloaded" });
  await page.getByText("LOR paneli").waitFor();

  await page.getByRole("button", { name: "Keyingi: Bemor" }).first().click();
  await page.getByLabel("Bemor F.I.O").fill("Lola Aliyeva");
  await page.getByRole("button", { name: "Keyingi: Xizmatlar" }).first().click();
  await page.getByRole("button", { name: /Burun chayish/ }).first().click();
  await page.getByRole("button", { name: /Keyingi: Preview|Keyingi/ }).first().click();
  await page.getByText("4-qadam: Chek preview").waitFor();
  await page.getByRole("button", { name: /Chek chiqarish/ }).first().click();
  await page.getByText("Chek muvaffaqiyatli yaratildi.").waitFor({ timeout: 10000 });

  const printWrites = await page.evaluate(() => window.__printWrites || []);
  const hasPrintedHtml = printWrites.some(
    (entry) => String(entry.html).includes("SAMPI MEDLINE") && String(entry.html).includes("Lola Aliyeva")
  );
  if (!hasPrintedHtml) throw new Error("LOR checkout print HTML topilmadi");
  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioDeliveryRestock(browser) {
  const context = await authContext(browser, "delivery");
  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, "delivery");

  await page.goto(`${BASE_URL}/delivery`, { waitUntil: "domcontentloaded" });
  await page.getByText("Kuryer paneli").waitFor();
  const selectorCard = page.locator("div.card").filter({ hasText: "1-qadam: Dorilarni tanlang" }).first();
  await selectorCard.getByRole("button", { name: /Paracetamol/ }).first().click();
  await page.getByLabel("Keltirilgan miqdor").first().fill("15");
  await page.getByRole("button", { name: "Omborga qo'shish" }).first().click();

  const successAlert = page.getByText(/ombor qoldig'i muvaffaqiyatli oshirildi/i);
  const errorAlert = page.getByText(/Kamida bitta dori tanlang|miqdor 0 dan katta bo'lishi kerak|Tarmoq xatosi/i);

  try {
    await successAlert.waitFor({ timeout: 10000 });
  } catch {
    const errorText = (await errorAlert.first().isVisible()) ? await errorAlert.first().innerText() : "Noma'lum xato";
    const extra = errors.length ? `\n${errors.join("\n")}` : "";
    throw new Error(`Delivery restock muvaffaqiyatsiz: ${errorText}${extra}`);
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioCashierAccept(browser) {
  const context = await authContext(browser, "cashier");
  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, "cashier-accept");

  await page.goto(`${BASE_URL}/cashier/nurse-patients`, { waitUntil: "domcontentloaded" });
  await page.getByText("Nurse cheklar qabuli").waitFor();
  await page.getByRole("button", { name: "Qabul qilish" }).first().click();
  await page.getByLabel("To'langan summa").fill("10000");
  await page.getByRole("button", { name: "Chekni qabul qilish" }).click();

  const successAlert = page.getByText("Chek kassada qabul qilindi.");
  const errorAlert = page.getByText(/To'langan summa chek summasidan oshmasligi kerak|Avval qabul qilinadigan chekni tanlang|Tarmoq xatosi/i);

  try {
    await successAlert.waitFor({ timeout: 10000 });
  } catch {
    const errorText = (await errorAlert.first().isVisible()) ? await errorAlert.first().innerText() : "Noma'lum xato";
    throw new Error(`Cashier qabul qilish muvaffaqiyatsiz: ${errorText}`);
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioRolePagesSmoke(browser, role, pages) {
  const context = await authContext(browser, role);
  const page = await context.newPage();
  const errors = [];
  attachErrorCollectors(page, errors, `${role}-smoke`);

  for (const route of pages) {
    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.getByText(route.text, { exact: false }).first().waitFor({ timeout: 12000 });
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
}

async function scenarioParallelMultiRoleFlow(browser) {
  const checkCountBefore = state.checks.length;
  const med2Before = safeNum(state.medicines.find((m) => m._id === "med2")?.stock);

  const [nurseCtx, lor1Ctx, lor2Ctx, deliveryCtx, managerCtx] = await Promise.all([
    authContext(browser, "nurse"),
    authContext(browser, "lor", {}, { lorIdentity: "lor1", userId: "lor-user-1", userName: "Aziz Lor" }),
    authContext(browser, "lor", {}, { lorIdentity: "lor2", userId: "lor-user-1", userName: "Aziz Lor" }),
    authContext(browser, "delivery"),
    authContext(browser, "manager")
  ]);

  const nursePage = await nurseCtx.newPage();
  const lor1Page = await lor1Ctx.newPage();
  const lor2Page = await lor2Ctx.newPage();
  const deliveryPage = await deliveryCtx.newPage();
  const managerPage = await managerCtx.newPage();
  const errors = [];

  try {
    attachErrorCollectors(nursePage, errors, "parallel-nurse");
    attachErrorCollectors(lor1Page, errors, "parallel-lor1");
    attachErrorCollectors(lor2Page, errors, "parallel-lor2");
    attachErrorCollectors(deliveryPage, errors, "parallel-delivery");
    attachErrorCollectors(managerPage, errors, "parallel-manager");

    await Promise.all([
      nursePage.goto(`${BASE_URL}/nurse`, { waitUntil: "domcontentloaded" }),
      lor1Page.goto(`${BASE_URL}/lor/services`, { waitUntil: "domcontentloaded" }),
      lor2Page.goto(`${BASE_URL}/lor/services`, { waitUntil: "domcontentloaded" }),
      deliveryPage.goto(`${BASE_URL}/delivery`, { waitUntil: "domcontentloaded" }),
      managerPage.goto(`${BASE_URL}/manager`, { waitUntil: "domcontentloaded" })
    ]);

    await Promise.all([
      nursePage.getByText("Hamshira paneli").waitFor(),
      lor1Page.getByText("LOR paneli").waitFor(),
      lor2Page.getByText("LOR paneli").waitFor(),
      deliveryPage.getByText("Kuryer paneli").waitFor(),
      managerPage.getByText("Umumiy statistika").waitFor()
    ]);

    const nurseFlow = async () => {
      await nursePage.getByRole("button", { name: "Keyingi: Bemor" }).first().click();
      await nursePage.getByLabel("Bemor F.I.O").fill("Parallel Nurse");
      await nursePage.getByRole("button", { name: "Keyingi: Dorilar" }).first().click();
      await nursePage.getByRole("button", { name: "Skip" }).first().click();
      await nursePage.getByRole("button", { name: /Ukol qilish/ }).first().click();
      await nursePage.getByRole("button", { name: "Keyingi" }).first().click();
      await nursePage.getByRole("button", { name: /Chek chiqarish/ }).first().click();
      await nursePage.getByText("Chek muvaffaqiyatli yaratildi.").waitFor({ timeout: 12000 });
    };

    const lor1Flow = async () => {
      await lor1Page.getByRole("button", { name: "Keyingi: Bemor" }).first().click();
      await lor1Page.getByLabel("Bemor F.I.O").fill("Parallel Lor1");
      await lor1Page.getByRole("button", { name: "Keyingi: Xizmatlar" }).first().click();
      await lor1Page.getByRole("button", { name: /Burun chayish/ }).first().click();
      await lor1Page.getByRole("button", { name: /Keyingi: Preview|Keyingi/ }).first().click();
      await lor1Page.getByRole("button", { name: /Chek chiqarish/ }).first().click();
      await lor1Page.getByText("Chek muvaffaqiyatli yaratildi.").waitFor({ timeout: 12000 });
    };

    const lor2Flow = async () => {
      await lor2Page.getByRole("button", { name: "Keyingi: Bemor" }).first().click();
      await lor2Page.getByLabel("Bemor F.I.O").fill("Parallel Lor2");
      await lor2Page.getByRole("button", { name: "Keyingi: Xizmatlar" }).first().click();
      await lor2Page.locator("button.sampi-choice-card").first().click();
      await lor2Page.getByRole("button", { name: /Keyingi: Preview|Keyingi/ }).first().click();
      await lor2Page.getByRole("button", { name: /Chek chiqarish/ }).first().click();
      await lor2Page.getByText("Chek muvaffaqiyatli yaratildi.").waitFor({ timeout: 12000 });
    };

    const deliveryFlow = async () => {
      const selectorCard = deliveryPage.locator("div.card").filter({ hasText: "1-qadam: Dorilarni tanlang" }).first();
      await selectorCard.getByRole("button", { name: /Ibuprofen/ }).first().click();
      await deliveryPage.getByLabel("Keltirilgan miqdor").first().fill("6");
      await deliveryPage.getByRole("button", { name: "Omborga qo'shish" }).first().click();
      await deliveryPage.getByText(/ombor qoldig'i muvaffaqiyatli oshirildi/i).waitFor({ timeout: 12000 });
    };

    await Promise.all([nurseFlow(), lor1Flow(), lor2Flow(), deliveryFlow()]);

    await managerPage.getByRole("button", { name: "Yangilash" }).click();
    await managerPage.getByText("LOR-2").first().waitFor({ timeout: 12000 });

    const checkCountAfter = state.checks.length;
    const med2After = safeNum(state.medicines.find((m) => m._id === "med2")?.stock);
    const hasParallelNurse = state.checks.some((c) => c.patient?.fullName === "Parallel Nurse" && c.creatorRole === "nurse");
    const hasParallelLor1 = state.checks.some(
      (c) => c.patient?.fullName === "Parallel Lor1" && c.creatorRole === "lor" && c.lorIdentity === "lor1"
    );
    const hasParallelLor2 = state.checks.some(
      (c) => c.patient?.fullName === "Parallel Lor2" && c.creatorRole === "lor" && c.lorIdentity === "lor2"
    );

    const lor2ChecksCount = state.checks.filter((c) => c.creatorRole === "lor" && c.lorIdentity === "lor2").length;

    if (checkCountAfter < checkCountBefore + 3) {
      throw new Error(`Parallel oqimda yetarli chek yaralmadi: oldin=${checkCountBefore}, keyin=${checkCountAfter}`);
    }
    if (!hasParallelNurse) throw new Error("Parallel nurse chek topilmadi");
    if (!hasParallelLor1) throw new Error("Parallel LOR-1 chek topilmadi");
    if (!hasParallelLor2) throw new Error("Parallel LOR-2 chek topilmadi");
    if (med2After < med2Before + 6) {
      throw new Error(`Delivery parallel restock ishlamadi: oldin=${med2Before}, keyin=${med2After}`);
    }
    if (lor2ChecksCount < 1) {
      throw new Error("LOR-2 uchun kamida bitta chek bo'lishi kerak edi");
    }
    if (errors.length > 0) throw new Error(errors.join("\n"));
  } finally {
    await Promise.allSettled([
      nurseCtx.close(),
      lor1Ctx.close(),
      lor2Ctx.close(),
      deliveryCtx.close(),
      managerCtx.close()
    ]);
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  await withScenario("Login Flow", async () => scenarioLoginFlow(browser), results);
  await withScenario("Mobile Login Layout", async () => scenarioMobileLoginLayout(browser), results);
  await withScenario("Nurse Checkout + Print", async () => scenarioNurseCheckoutPrint(browser), results);
  await withScenario("LOR Checkout + Print", async () => scenarioLorCheckoutPrint(browser), results);
  await withScenario("Delivery Restock", async () => scenarioDeliveryRestock(browser), results);
  await withScenario("Cashier Accept Pending Check", async () => scenarioCashierAccept(browser), results);

  await withScenario(
    "Nurse Pages Smoke",
    async () =>
      scenarioRolePagesSmoke(browser, "nurse", [
        { path: "/nurse/checks", text: "Mening cheklarim" },
        { path: "/nurse/specialists", text: "Hamshiralarni boshqarish" },
        { path: "/nurse/medicines", text: "Dori Qoshish" },
        { path: "/nurse/services", text: "Xizmat Qo'shish" }
      ]),
    results
  );

  await withScenario(
    "LOR Pages Smoke",
    async () =>
      scenarioRolePagesSmoke(browser, "lor", [
        { path: "/lor/checks", text: "Mening cheklarim" },
        { path: "/lor/specialists", text: "Doktorlarni boshqarish" },
        { path: "/lor/services/add", text: "Xizmat qo'shish" },
        { path: "/lor", text: "Mening cheklarim" }
      ]),
    results
  );

  await withScenario(
    "Manager Pages Smoke",
    async () =>
      scenarioRolePagesSmoke(browser, "manager", [
        { path: "/manager", text: "Umumiy statistika" },
        { path: "/manager/stock", text: "Ombor qoldiqlari" },
        { path: "/manager/most-used", text: "Ko'p ishlatilgan dorilar" },
        { path: "/manager/usage-history", text: "Dori sarfi tarixi" }
      ]),
    results
  );

  await withScenario(
    "Cashier Pages Smoke",
    async () =>
      scenarioRolePagesSmoke(browser, "cashier", [
        { path: "/cashier/nurse-entries", text: "Nurse yozuvlari" },
        { path: "/cashier/nurse-history", text: "Nurse tarixi" },
        { path: "/cashier/lor-entries", text: "LOR yozuvlari" },
        { path: "/cashier/lor-history", text: "LOR tarixi" },
        { path: "/cashier/nurse-specialists", text: "Nurse shifokorlar" },
        { path: "/cashier/lor-specialists", text: "LOR shifokorlar" },
        { path: "/cashier/journal", text: "Kassa jurnali" },
        { path: "/cashier/debts", text: "Qarzdorlar ro'yxati" }
      ]),
    results
  );

  await withScenario(
    "Parallel Nurse/LOR1/LOR2/Manager/Delivery",
    async () => scenarioParallelMultiRoleFlow(browser),
    results
  );

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== QA SMOKE RESULTS ===");
  for (const row of results) {
    const icon = row.ok ? "PASS" : "FAIL";
    console.log(`${icon.padEnd(4)} | ${row.name} | ${row.ms}ms`);
    if (!row.ok) {
      for (const detail of row.details) console.log(`  - ${detail}`);
    }
  }

  if (failed.length > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
