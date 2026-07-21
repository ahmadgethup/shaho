"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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

interface Delivery {
  id: string;
  rep_name: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  location: string;
  notes: string;
  delivered_at: string;
}

// نفس ألوان "بكرات الخيط" المستخدمة بالصفحة الرئيسية، تدور على المندوبين بالترتيب
const THREAD_COLORS = [
  "#C9A227",
  "#7A2A2E",
  "#4C6B4F",
  "#3E5C76",
  "#A6552D",
  "#A9854D",
];

export default function DeliveriesPage() {
  const router = useRouter();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRep, setSelectedRep] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase
      .from("catalog_deliveries")
      .select(
        "id, rep_name, shop_name, owner_name, phone, location, notes, delivered_at"
      )
      .order("delivered_at", { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;

        if (error) {
          console.error("Error loading deliveries:", error);
          setLoading(false);
          return;
        }

        setDeliveries(data ?? []);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDeleteDelivery = async (delivery: Delivery) => {
    if (
      !window.confirm(
        `هل تريد حذف تسليم «${delivery.shop_name}» من السجل نهائياً؟`
      )
    ) {
      return;
    }

    setDeletingId(delivery.id);

    const { error } = await supabase
      .from("catalog_deliveries")
      .delete()
      .eq("id", delivery.id);

    if (error) {
      console.error("Error deleting delivery:", error);
      alert(`تعذر حذف التسليم: ${error.message}`);
      setDeletingId(null);
      return;
    }

    setDeliveries((current) =>
      current.filter((item) => item.id !== delivery.id)
    );
    setDeletingId(null);
  };

  // ترتيب المندوبين حسب عدد المحلات اللي وزعوا عليها
  const repLeaderboard = useMemo(() => {
    const counts = new Map<string, number>();

    deliveries.forEach((delivery) => {
      counts.set(delivery.rep_name, (counts.get(delivery.rep_name) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [deliveries]);

  const maxRepCount = repLeaderboard[0]?.count ?? 1;
  const uniqueShops = useMemo(
    () => new Set(deliveries.map((d) => d.shop_name)).size,
    [deliveries]
  );

  const filteredDeliveries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return deliveries.filter((delivery) => {
      const matchesRep = !selectedRep || delivery.rep_name === selectedRep;

      const matchesSearch =
        !query ||
        [
          delivery.shop_name,
          delivery.owner_name,
          delivery.phone,
          delivery.location,
        ].some((value) => value?.toLowerCase().includes(query));

      return matchesRep && matchesSearch;
    });
  }, [deliveries, search, selectedRep]);

  return (
    <main
      className={`${cairo.className} min-h-screen bg-[#171310] p-6 pb-16 text-white relative overflow-x-hidden`}
      dir="rtl"
    >
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px)",
        }}
      />

      <div className="absolute top-[-15%] right-[-10%] w-[600px] h-[600px] bg-[#C9A227] opacity-[0.05] rounded-full blur-[130px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-8 mt-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-[#8C8272] hover:text-[#C9A227] transition-colors"
          >
            <BackIcon />
            <span>العودة للرئيسية</span>
          </button>

          <div className="text-left">
            <h1
              className={`${arefRuqaa.className} text-4xl font-bold text-[#EDE6D6]`}
            >
              تسليمات الكتالوكات
            </h1>
            <p className="text-sm text-[#8C8272] mt-2">
              متابعة المحلات اللي زارها المندوبين
            </p>
          </div>
        </div>

        {/* بطاقات ملخص سريعة */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <SummaryCard
            title="إجمالي التسليمات"
            value={deliveries.length.toString()}
          />
          <SummaryCard
            title="عدد المحلات الفريدة"
            value={uniqueShops.toString()}
          />
          <SummaryCard
            title="عدد المندوبين النشطين"
            value={repLeaderboard.length.toString()}
          />
        </div>

        {/* لوحة شرف المندوبين */}
        {repLeaderboard.length > 0 && (
          <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 mb-8">
            <h2 className="text-lg font-bold text-[#C9A227] mb-5">
              ترتيب المندوبين
            </h2>

            <div className="flex flex-col gap-4">
              {repLeaderboard.map((rep, index) => {
                const color = THREAD_COLORS[index % THREAD_COLORS.length];
                const widthPercent = (rep.count / maxRepCount) * 100;

                return (
                  <button
                    key={rep.name}
                    onClick={() =>
                      setSelectedRep((current) =>
                        current === rep.name ? "" : rep.name
                      )
                    }
                    className="text-right group"
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span
                        className={`font-bold transition-colors ${
                          selectedRep === rep.name
                            ? "text-white"
                            : "text-[#EDE6D6] group-hover:text-white"
                        }`}
                      >
                        {rep.name}
                      </span>
                      <span className="text-sm text-[#8C8272]">
                        {rep.count} محل
                      </span>
                    </div>

                    <div className="h-2.5 w-full bg-[#0E0B08] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPercent}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedRep && (
              <p className="text-xs text-[#8C8272] mt-4">
                يتم عرض تسليمات{" "}
                <span className="text-[#C9A227] font-bold">{selectedRep}</span>{" "}
                فقط.{" "}
                <button
                  onClick={() => setSelectedRep("")}
                  className="underline hover:text-[#C9A227]"
                >
                  إلغاء الفلتر
                </button>
              </p>
            )}
          </div>
        )}

        {/* البحث */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث باسم المحل، صاحبه، الهاتف، أو الموقع..."
            className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
          />
        </div>

        {/* جدول التفاصيل */}
        <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-[#221B14] text-[#C9A227] border-b border-dashed border-[#3A3128]">
                  <th className="py-4 px-5">التاريخ</th>
                  <th className="py-4 px-5">المندوب</th>
                  <th className="py-4 px-5">المحل</th>
                  <th className="py-4 px-5">صاحب المحل</th>
                  <th className="py-4 px-5">الهاتف</th>
                  <th className="py-4 px-5">الموقع</th>
                  <th className="py-4 px-5 text-center">إجراء</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#C9A227]"
                    >
                      جاري التحميل...
                    </td>
                  </tr>
                ) : filteredDeliveries.length > 0 ? (
                  filteredDeliveries.map((delivery) => (
                    <tr
                      key={delivery.id}
                      className="border-b border-dashed border-[#3A3128] hover:bg-[#221B14] transition-colors"
                    >
                      <td className="py-4 px-5 text-sm text-[#8C8272] whitespace-nowrap">
                        {new Date(delivery.delivered_at).toLocaleString(
                          "ar-IQ",
                          {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </td>
                      <td className="py-4 px-5 font-bold text-[#C9A227]">
                        {delivery.rep_name}
                      </td>
                      <td className="py-4 px-5 text-[#EDE6D6]">
                        {delivery.shop_name}
                      </td>
                      <td className="py-4 px-5 text-[#B3A990]">
                        {delivery.owner_name || "-"}
                      </td>
                      <td className="py-4 px-5 text-[#B3A990]">
                        {delivery.phone || "-"}
                      </td>
                      <td className="py-4 px-5 text-[#B3A990]">
                        {delivery.location || "-"}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <button
                          onClick={() => void handleDeleteDelivery(delivery)}
                          disabled={deletingId === delivery.id}
                          className="bg-[#C1523F]/10 text-[#E08A78] hover:bg-[#C1523F] hover:text-white border border-[#C1523F]/30 px-3 py-1.5 rounded-sm text-xs font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <TrashIcon />
                          {deletingId === delivery.id ? "جارٍ الحذف..." : "حذف"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#665D4E]"
                    >
                      لا توجد تسليمات مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 p-6 rounded-sm">
      <p className="text-[#8C8272] mb-2">{title}</p>
      <h3 className="text-3xl font-bold font-mono text-white">{value}</h3>
    </div>
  );
}

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
