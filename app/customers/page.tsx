"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, Variants } from "framer-motion";
import { Cairo, Aref_Ruqaa } from "next/font/google";
import { supabase } from "@/lib/supabase";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "600", "700", "800"],
});

const arefRuqaa = Aref_Ruqaa({
  subsets: ["arabic"],
  weight: ["400", "700"],
});

interface Customer {
  id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  location: string;
  notes: string;
  created_at: string;
}

interface CustomerSale {
  id: number;
  invoice_number: string | null;
  product_name: string;
  quantity_sold: number;
  sale_type: "meter" | "roll";
  // True meter-equivalent deducted from stock for this sale, regardless of
  // whether it was sold by the meter or by the roll. This is what "how many
  // meters did this customer buy" should read from, not quantity_sold.
  stock_quantity_deducted: number | null;
  actual_total_price: number;
  created_at: string;
}

interface SaleAggregateRow {
  customer_id: string | null;
  actual_total_price: number;
  stock_quantity_deducted: number | null;
  created_at: string;
}

interface CustomerStats {
  totalSpent: number;
  totalMeters: number;
  purchaseCount: number;
  lastPurchaseAt: string;
}

const emptyCustomer = {
  shop_name: "",
  owner_name: "",
  phone: "",
  location: "",
  notes: "",
};

const formatIqd = (amount: number) =>
  `${Number(amount || 0).toLocaleString("en-IQ")} د.ع`;

const formatMeters = (amount: number) =>
  `${Number(amount || 0).toLocaleString("en-IQ")} متر`;

async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as Customer[];
}

// Only sales tied to a saved customer feed the statistics below —
// walk-in sales (customer_id is null) are excluded on purpose.
async function getCustomerSalesAggregates(): Promise<SaleAggregateRow[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "customer_id, actual_total_price, stock_quantity_deducted, created_at"
    )
    .not("customer_id", "is", null);

  if (error) throw error;

  return (data ?? []) as SaleAggregateRow[];
}

async function getCustomersPageData(): Promise<{
  customers: Customer[];
  saleAggregates: SaleAggregateRow[];
}> {
  const [customers, saleAggregates] = await Promise.all([
    getCustomers(),
    getCustomerSalesAggregates(),
  ]);

  return { customers, saleAggregates };
}

export default function CustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saleAggregates, setSaleAggregates] = useState<SaleAggregateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState(emptyCustomer);

  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<CustomerSale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // تعديل بيانات زبون موجود
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editFormData, setEditFormData] = useState(emptyCustomer);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // حذف زبون
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getCustomersPageData()
      .then(
        ({
          customers: fetchedCustomers,
          saleAggregates: fetchedAggregates,
        }) => {
          if (!isMounted) return;
          setCustomers(fetchedCustomers);
          setSaleAggregates(fetchedAggregates);
          setLoading(false);
        }
      )
      .catch((error: unknown) => {
        console.error("Error loading customers:", error);

        if (isMounted) {
          alert("حدث خطأ أثناء جلب الزبائن.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshCustomers = async () => {
    try {
      const { customers: fetchedCustomers, saleAggregates: fetchedAggregates } =
        await getCustomersPageData();

      setCustomers(fetchedCustomers);
      setSaleAggregates(fetchedAggregates);
    } catch (error: unknown) {
      console.error("Error refreshing customers:", error);
      alert("حدث خطأ أثناء تحديث الزبائن.");
    }
  };

  // ==========================================
  // إحصائيات الزبائن: تُشتق كلها من saleAggregates + customers
  // ==========================================
  const customerStatsMap = useMemo(() => {
    const map = new Map<string, CustomerStats>();

    for (const row of saleAggregates) {
      if (!row.customer_id) continue;

      const existing = map.get(row.customer_id);
      const meters = Number(row.stock_quantity_deducted || 0);

      if (existing) {
        existing.totalSpent += Number(row.actual_total_price || 0);
        existing.totalMeters += meters;
        existing.purchaseCount += 1;
        if (new Date(row.created_at) > new Date(existing.lastPurchaseAt)) {
          existing.lastPurchaseAt = row.created_at;
        }
      } else {
        map.set(row.customer_id, {
          totalSpent: Number(row.actual_total_price || 0),
          totalMeters: meters,
          purchaseCount: 1,
          lastPurchaseAt: row.created_at,
        });
      }
    }

    return map;
  }, [saleAggregates]);

  const rankedCustomers = useMemo(
    () =>
      customers
        .map((customer) => ({
          customer,
          stats: customerStatsMap.get(customer.id) ?? {
            totalSpent: 0,
            totalMeters: 0,
            purchaseCount: 0,
            lastPurchaseAt: "",
          },
        }))
        .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent),
    [customers, customerStatsMap]
  );

  const topSpenderEntry = useMemo(
    () =>
      rankedCustomers[0]?.stats.totalSpent > 0 ? rankedCustomers[0] : null,
    [rankedCustomers]
  );

  const topFrequentEntry = useMemo(() => {
    const withPurchases = customers
      .map((customer) => ({
        customer,
        stats: customerStatsMap.get(customer.id),
      }))
      .filter(
        (entry): entry is { customer: Customer; stats: CustomerStats } =>
          !!entry.stats && entry.stats.purchaseCount > 0
      );

    if (withPurchases.length === 0) return null;

    return withPurchases.reduce((best, entry) =>
      entry.stats.purchaseCount > best.stats.purchaseCount ? entry : best
    );
  }, [customers, customerStatsMap]);

  const newThisMonthCount = useMemo(() => {
    const now = new Date();

    return customers.filter((customer) => {
      const created = new Date(customer.created_at);
      return (
        created.getMonth() === now.getMonth() &&
        created.getFullYear() === now.getFullYear()
      );
    }).length;
  }, [customers]);

  const totalRevenueFromCustomers = useMemo(() => {
    let total = 0;
    customerStatsMap.forEach((stats) => {
      total += stats.totalSpent;
    });
    return total;
  }, [customerStatsMap]);

  const totalMetersFromCustomers = useMemo(() => {
    let total = 0;
    customerStatsMap.forEach((stats) => {
      total += stats.totalMeters;
    });
    return total;
  }, [customerStatsMap]);

  const topFiveCustomers = useMemo(
    () =>
      rankedCustomers.filter((entry) => entry.stats.totalSpent > 0).slice(0, 5),
    [rankedCustomers]
  );

  const maxSpent = topFiveCustomers[0]?.stats.totalSpent || 1;

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return customers;

    return customers.filter((customer) =>
      [
        customer.shop_name,
        customer.owner_name,
        customer.phone,
        customer.location,
      ].some((value) => value?.toLowerCase().includes(query))
    );
  }, [customers, search]);

  const handleAddCustomer = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.shop_name.trim()) {
      alert("يرجى إدخال اسم المحل أو الزبون.");
      return;
    }

    setIsProcessing(true);

    const { error } = await supabase.from("customers").insert([
      {
        shop_name: formData.shop_name.trim(),
        owner_name: formData.owner_name.trim(),
        phone: formData.phone.trim(),
        location: formData.location.trim(),
        notes: formData.notes.trim(),
      },
    ]);

    if (error) {
      console.error("Error adding customer:", error);
      alert("حدث خطأ أثناء حفظ الزبون.");
      setIsProcessing(false);
      return;
    }

    setFormData(emptyCustomer);
    setIsAddModalOpen(false);
    await refreshCustomers();
    setIsProcessing(false);
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditFormData({
      shop_name: customer.shop_name,
      owner_name: customer.owner_name,
      phone: customer.phone,
      location: customer.location,
      notes: customer.notes,
    });
  };

  const closeEditModal = () => {
    setEditingCustomer(null);
    setEditFormData(emptyCustomer);
  };

  const handleUpdateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!editingCustomer) return;

    if (!editFormData.shop_name.trim()) {
      alert("يرجى إدخال اسم المحل أو الزبون.");
      return;
    }

    setIsSavingEdit(true);

    const { error } = await supabase
      .from("customers")
      .update({
        shop_name: editFormData.shop_name.trim(),
        owner_name: editFormData.owner_name.trim(),
        phone: editFormData.phone.trim(),
        location: editFormData.location.trim(),
        notes: editFormData.notes.trim(),
      })
      .eq("id", editingCustomer.id);

    if (error) {
      console.error("Error updating customer:", error);
      alert(`تعذر تحديث بيانات الزبون: ${error.message}`);
      setIsSavingEdit(false);
      return;
    }

    closeEditModal();
    await refreshCustomers();
    setIsSavingEdit(false);
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (
      !window.confirm(
        `هل تريد حذف الزبون «${customer.shop_name}» نهائياً؟ لن يتم حذف فواتيره السابقة لكن ستبقى بدون ربط بزبون.`
      )
    ) {
      return;
    }

    setDeletingId(customer.id);

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id);

    if (error) {
      console.error("Error deleting customer:", error);
      alert(`تعذر حذف الزبون: ${error.message}`);
      setDeletingId(null);
      return;
    }

    if (historyCustomer?.id === customer.id) {
      setHistoryCustomer(null);
      setCustomerSales([]);
    }

    await refreshCustomers();
    setDeletingId(null);
  };

  const openHistory = async (customer: Customer) => {
    setHistoryCustomer(customer);
    setHistoryLoading(true);
    setCustomerSales([]);

    const { data, error } = await supabase
      .from("sales")
      .select(
        "id, invoice_number, product_name, quantity_sold, sale_type, stock_quantity_deducted, actual_total_price, created_at"
      )
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading customer history:", error);
      alert("حدث خطأ أثناء جلب سجل مشتريات الزبون.");
    } else {
      setCustomerSales((data ?? []) as CustomerSale[]);
    }

    setHistoryLoading(false);
  };

  const totalPurchases = customerSales.reduce(
    (total, sale) => total + Number(sale.actual_total_price || 0),
    0
  );

  const totalPurchasedMeters = customerSales.reduce(
    (total, sale) => total + Number(sale.stock_quantity_deducted || 0),
    0
  );

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.15 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };

  return (
    <main
      className={`${cairo.className} min-h-screen bg-[#171310] text-white p-6 relative overflow-x-hidden`}
      dir="rtl"
    >
      {/* نسيج الخلفية: نفس تشابك النسيج المستخدم في باقي شاشات التطبيق */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px)",
        }}
      />

      <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] bg-[#C9A227] opacity-[0.05] rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-7xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-8 border-b border-dashed border-[#C9A227]/25 pb-6">
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-[#8C8272] hover:text-[#C9A227] transition-colors"
          >
            <BackIcon />
            العودة للرئيسية
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-left"
          >
            <h1
              className={`${arefRuqaa.className} text-4xl font-bold text-[#EDE6D6]`}
            >
              الزبائن المتكررون
            </h1>
            <p className="text-sm text-[#8C8272] mt-2">
              متابعة بيانات الزبائن وسجل مشترياتهم
            </p>
          </motion.div>
        </div>

        {/* بطاقات الإحصائيات */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6"
        >
          <motion.div variants={itemVariants}>
            <StatCard
              title="إجمالي الزبائن"
              value={loading ? "..." : customers.length.toString()}
              icon={<UsersIcon />}
              thread="#C9A227"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="زبائن جدد هذا الشهر"
              value={loading ? "..." : newThisMonthCount.toString()}
              icon={<UserPlusIcon />}
              thread="#3E5C76"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="الأكثر شراءً"
              value={
                loading
                  ? "..."
                  : topSpenderEntry
                  ? formatIqd(topSpenderEntry.stats.totalSpent)
                  : "لا يوجد"
              }
              subtitle={topSpenderEntry?.customer.shop_name}
              icon={<TrophyIcon />}
              thread="#A6552D"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <StatCard
              title="الأكثر تكراراً للشراء"
              value={
                loading
                  ? "..."
                  : topFrequentEntry
                  ? `${topFrequentEntry.stats.purchaseCount} عملية`
                  : "لا يوجد"
              }
              subtitle={topFrequentEntry?.customer.shop_name}
              icon={<RepeatIcon />}
              thread="#4C6B4F"
            />
          </motion.div>
        </motion.div>

        {/* لوحة الصدارة: أفضل 5 زبائن */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 mb-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[#C9A227]">
              <TrophyIcon />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#EDE6D6]">
                أفضل 5 زبائن حسب إجمالي المشتريات
              </h3>
              {!loading && totalRevenueFromCustomers > 0 && (
                <p className="text-xs text-[#665D4E] mt-1">
                  إجمالي مبيعات الزبائن المسجلين:{" "}
                  <span className="text-[#C9A227] font-bold">
                    {formatIqd(totalRevenueFromCustomers)}
                  </span>
                  {" · "}
                  إجمالي الأمتار المباعة لهم:{" "}
                  <span className="text-[#C9A227] font-bold">
                    {formatMeters(totalMetersFromCustomers)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-[#665D4E] text-center py-6">
              جاري تحميل الإحصائيات...
            </p>
          ) : topFiveCustomers.length === 0 ? (
            <p className="text-sm text-[#665D4E] text-center py-6">
              لا توجد مبيعات مسجلة على زبائن حتى الآن.
            </p>
          ) : (
            <div className="space-y-4">
              {topFiveCustomers.map((entry, index) => {
                const widthPercent = Math.max(
                  8,
                  (entry.stats.totalSpent / maxSpent) * 100
                );
                const rankColor =
                  ["#C9A227", "#B8B0A0", "#A6552D"][index] ?? "#59503F";

                return (
                  <div
                    key={entry.customer.id}
                    className="flex items-center gap-4"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{
                        backgroundColor: `${rankColor}22`,
                        color: rankColor,
                        border: `1px solid ${rankColor}55`,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1.5 gap-3">
                        <span className="text-sm font-bold text-[#EDE6D6] truncate">
                          {entry.customer.shop_name}
                        </span>
                        <span className="text-sm font-mono text-[#C9A227] shrink-0">
                          {formatIqd(entry.stats.totalSpent)}
                          <span className="text-[#665D4E] mx-1">·</span>
                          {formatMeters(entry.stats.totalMeters)}
                        </span>
                      </div>

                      <div className="h-2 bg-[#0E0B08] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${widthPercent}%` }}
                          transition={{
                            duration: 0.9,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: rankColor }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <div className="flex flex-col md:flex-row gap-4 justify-between mb-6">
          <div className="relative w-full md:max-w-xl">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#665D4E] pointer-events-none">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم المحل أو صاحب المحل أو رقم الهاتف..."
              className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 pr-10 pl-4 focus:outline-none focus:border-[#C9A227]"
            />
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 px-6 rounded-sm transition-colors"
          >
            <PlusIcon />
            إضافة زبون متكرر
          </button>
        </div>

        <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-[#221B14] text-[#C9A227] border-b border-dashed border-[#3A3128]">
                  <th className="py-4 px-5 font-normal">المحل / الزبون</th>
                  <th className="py-4 px-5 font-normal">صاحب المحل</th>
                  <th className="py-4 px-5 font-normal">رقم الموبايل</th>
                  <th className="py-4 px-5 font-normal">الموقع</th>
                  <th className="py-4 px-5 font-normal">إجمالي المشتريات</th>
                  <th className="py-4 px-5 font-normal">الأمتار المشتراة</th>
                  <th className="py-4 px-5 font-normal text-center">الإجراء</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#C9A227]"
                    >
                      جاري تحميل الزبائن...
                    </td>
                  </tr>
                ) : filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => {
                    const stats = customerStatsMap.get(customer.id);
                    const isTopSpender =
                      topSpenderEntry?.customer.id === customer.id;

                    return (
                      <tr
                        key={customer.id}
                        className="border-b border-dashed border-[#3A3128] hover:bg-[#221B14] transition-colors"
                      >
                        <td className="py-4 px-5 font-bold text-[#EDE6D6]">
                          <span className="flex items-center gap-2">
                            {customer.shop_name}
                            {isTopSpender && (
                              <span
                                className="text-[#C9A227]"
                                title="الزبون الأكثر شراءً"
                              >
                                <CrownIcon />
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-[#B3A990]">
                          {customer.owner_name || "-"}
                        </td>
                        <td className="py-4 px-5 text-[#B3A990]">
                          {customer.phone || "-"}
                        </td>
                        <td className="py-4 px-5 text-[#B3A990]">
                          {customer.location || "-"}
                        </td>
                        <td className="py-4 px-5 text-[#B3A990] font-mono">
                          {stats ? formatIqd(stats.totalSpent) : "-"}
                        </td>
                        <td className="py-4 px-5 text-[#B3A990] font-mono">
                          {stats ? formatMeters(stats.totalMeters) : "-"}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              onClick={() => openHistory(customer)}
                              className="bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/30 hover:bg-[#C9A227] hover:text-[#171310] px-3 py-1.5 rounded-sm text-xs font-bold transition-colors"
                            >
                              سجل المشتريات
                            </button>

                            <button
                              onClick={() => openEditCustomer(customer)}
                              className="bg-[#3E5C76]/10 text-[#7FA3C2] border border-[#3E5C76]/30 hover:bg-[#3E5C76] hover:text-white px-3 py-1.5 rounded-sm text-xs font-bold transition-colors flex items-center gap-1"
                            >
                              <EditIcon />
                              تعديل
                            </button>

                            <button
                              onClick={() =>
                                void handleDeleteCustomer(customer)
                              }
                              disabled={deletingId === customer.id}
                              className="bg-[#C1523F]/10 text-[#E08A78] border border-[#C1523F]/30 hover:bg-[#C1523F] hover:text-white px-3 py-1.5 rounded-sm text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <TrashIcon />
                              {deletingId === customer.id
                                ? "جارٍ الحذف..."
                                : "حذف"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#665D4E]"
                    >
                      لا يوجد زبائن مطابقون.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-8 w-full max-w-2xl relative"
            >
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setFormData(emptyCustomer);
                }}
                className="absolute top-4 left-4 text-[#8C8272] hover:text-white transition-colors"
              >
                <CloseIcon />
              </button>

              <h2 className="text-2xl font-bold text-[#C9A227] mb-6">
                إضافة زبون متكرر
              </h2>

              <form
                onSubmit={handleAddCustomer}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <Input
                  label="اسم المحل / الزبون"
                  required
                  value={formData.shop_name}
                  onChange={(value) =>
                    setFormData({ ...formData, shop_name: value })
                  }
                />

                <Input
                  label="اسم صاحب المحل"
                  value={formData.owner_name}
                  onChange={(value) =>
                    setFormData({ ...formData, owner_name: value })
                  }
                />

                <Input
                  label="رقم الموبايل"
                  value={formData.phone}
                  onChange={(value) =>
                    setFormData({ ...formData, phone: value })
                  }
                />

                <Input
                  label="موقع المحل"
                  value={formData.location}
                  onChange={(value) =>
                    setFormData({ ...formData, location: value })
                  }
                />

                <div className="md:col-span-2">
                  <label className="block text-[#8C8272] text-sm mb-2">
                    ملاحظات
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        notes: event.target.value,
                      })
                    }
                    className="w-full min-h-24 bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="md:col-span-2 mt-3 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-4 rounded-sm disabled:opacity-50 transition-colors"
                >
                  {isProcessing ? "جاري الحفظ..." : "حفظ الزبون"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {editingCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-8 w-full max-w-2xl relative"
            >
              <button
                onClick={closeEditModal}
                className="absolute top-4 left-4 text-[#8C8272] hover:text-white transition-colors"
              >
                <CloseIcon />
              </button>

              <h2 className="text-2xl font-bold text-[#C9A227] mb-1">
                تعديل بيانات الزبون
              </h2>
              <p className="text-sm text-[#8C8272] mb-6">
                {editingCustomer.shop_name}
              </p>

              <form
                onSubmit={handleUpdateCustomer}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <Input
                  label="اسم المحل / الزبون"
                  required
                  value={editFormData.shop_name}
                  onChange={(value) =>
                    setEditFormData({ ...editFormData, shop_name: value })
                  }
                />

                <Input
                  label="اسم صاحب المحل"
                  value={editFormData.owner_name}
                  onChange={(value) =>
                    setEditFormData({ ...editFormData, owner_name: value })
                  }
                />

                <Input
                  label="رقم الموبايل"
                  value={editFormData.phone}
                  onChange={(value) =>
                    setEditFormData({ ...editFormData, phone: value })
                  }
                />

                <Input
                  label="موقع المحل"
                  value={editFormData.location}
                  onChange={(value) =>
                    setEditFormData({ ...editFormData, location: value })
                  }
                />

                <div className="md:col-span-2">
                  <label className="block text-[#8C8272] text-sm mb-2">
                    ملاحظات
                  </label>
                  <textarea
                    value={editFormData.notes}
                    onChange={(event) =>
                      setEditFormData({
                        ...editFormData,
                        notes: event.target.value,
                      })
                    }
                    className="w-full min-h-24 bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                  />
                </div>

                <div className="md:col-span-2 grid grid-cols-2 gap-3 mt-3">
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-4 rounded-sm disabled:opacity-50 transition-colors"
                  >
                    {isSavingEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
                  </button>

                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="bg-transparent border border-[#3A3128] text-[#8C8272] hover:text-white py-4 rounded-sm transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {historyCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-6 w-full max-w-4xl relative max-h-[85vh] flex flex-col"
            >
              <button
                onClick={() => {
                  setHistoryCustomer(null);
                  setCustomerSales([]);
                }}
                className="absolute top-4 left-4 text-[#8C8272] hover:text-white transition-colors"
              >
                <CloseIcon />
              </button>

              <h2 className="text-2xl font-bold text-[#C9A227] mb-2">
                سجل مشتريات: {historyCustomer.shop_name}
              </h2>

              <p className="text-[#8C8272] mb-5">
                إجمالي المشتريات:{" "}
                <span className="text-[#C9A227] font-bold">
                  {formatIqd(totalPurchases)}
                </span>
                {" · "}
                إجمالي الأمتار:{" "}
                <span className="text-[#C9A227] font-bold">
                  {formatMeters(totalPurchasedMeters)}
                </span>
              </p>

              <div className="overflow-y-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="text-[#C9A227] border-b border-dashed border-[#3A3128]">
                      <th className="py-3 px-3 font-normal">التاريخ</th>
                      <th className="py-3 px-3 font-normal">رقم الفاتورة</th>
                      <th className="py-3 px-3 font-normal">القماش</th>
                      <th className="py-3 px-3 font-normal">الكمية</th>
                      <th className="py-3 px-3 font-normal">الأمتار</th>
                      <th className="py-3 px-3 font-normal">المبلغ</th>
                    </tr>
                  </thead>

                  <tbody>
                    {historyLoading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-10 text-center text-[#C9A227]"
                        >
                          جاري تحميل السجل...
                        </td>
                      </tr>
                    ) : customerSales.length > 0 ? (
                      customerSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="border-b border-dashed border-[#3A3128]"
                        >
                          <td className="py-3 px-3 text-sm text-[#B3A990]">
                            {new Date(sale.created_at).toLocaleString("ar-IQ")}
                          </td>
                          <td className="py-3 px-3 text-[#8C8272]">
                            {sale.invoice_number || "-"}
                          </td>
                          <td className="py-3 px-3 text-[#EDE6D6]">
                            {sale.product_name}
                          </td>
                          <td className="py-3 px-3 text-[#B3A990]">
                            {sale.quantity_sold}{" "}
                            {sale.sale_type === "meter" ? "متر" : "بكرة"}
                          </td>
                          <td className="py-3 px-3 text-[#B3A990] font-mono">
                            {sale.stock_quantity_deducted != null
                              ? formatMeters(sale.stock_quantity_deducted)
                              : "-"}
                          </td>
                          <td className="py-3 px-3 text-[#C9A227] font-mono">
                            {formatIqd(sale.actual_total_price)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-10 text-center text-[#665D4E]"
                        >
                          لا توجد مشتريات مسجلة لهذا الزبون.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// ==========================================
// بطاقة إحصائية موحّدة التصميم مع باقي شاشات التطبيق
// ==========================================
function StatCard({
  title,
  value,
  subtitle,
  icon,
  thread,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  thread: string;
}) {
  const cssVars = { "--thread": thread } as React.CSSProperties;

  return (
    <div
      style={cssVars}
      className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 h-full"
    >
      <div className="flex items-start justify-between mb-4">
        <p className="text-[#8C8272] text-sm">{title}</p>
        <div className="text-[var(--thread)] opacity-90">{icon}</div>
      </div>

      <h3 className="text-xl font-bold font-mono text-[#EDE6D6] truncate">
        {value}
      </h3>

      {subtitle && (
        <p className="text-xs text-[#665D4E] mt-2 truncate">{subtitle}</p>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[#8C8272] text-sm mb-2">{label}</label>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
      />
    </div>
  );
}

// ==========================================
// الأيقونات (Icons - SVG) بنفس أسلوب باقي شاشات التطبيق
// ==========================================
const BackIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const UsersIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const UserPlusIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 21a8 8 0 0 1 13.292-6" />
    <circle cx="10" cy="8" r="5" />
    <path d="M19 16v6" />
    <path d="M22 19h-6" />
  </svg>
);

const TrophyIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const RepeatIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

const CrownIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
  >
    <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.021 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294Z" />
  </svg>
);

const EditIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);
