"use client";

import { useEffect, useState } from "react";
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

interface Expense {
  id: number;
  description: string;
  amount: number;
  person_name: string;
  created_at: string;
}

async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Expense[];
}

export default function Expenses() {
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    person_name: "",
  });

  const refreshExpenses = async () => {
    try {
      const fetchedExpenses = await getExpenses();
      setExpenses(fetchedExpenses);
    } catch (error: unknown) {
      console.error("Error fetching expenses:", error);
      alert("حدث خطأ أثناء جلب المصروفات.");
    }
  };

  useEffect(() => {
    let isMounted = true;

    void getExpenses()
      .then((fetchedExpenses) => {
        if (!isMounted) return;

        setExpenses(fetchedExpenses);
        setLoading(false);
      })
      .catch((error: unknown) => {
        console.error("Error fetching expenses:", error);

        if (isMounted) {
          alert("حدث خطأ أثناء جلب المصروفات.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddExpense = async (event: React.FormEvent) => {
    event.preventDefault();

    const { description, amount, person_name } = formData;
    const amountNumber = parseFloat(amount);

    if (!description.trim() || !person_name.trim() || !amount) {
      alert("يرجى تعبئة جميع الحقول.");
      return;
    }

    if (Number.isNaN(amountNumber) || amountNumber <= 0) {
      alert("يرجى إدخال مبلغ صحيح.");
      return;
    }

    setIsProcessing(true);

    const { error } = await supabase.from("expenses").insert([
      {
        description: description.trim(),
        amount: amountNumber,
        person_name: person_name.trim(),
      },
    ]);

    if (error) {
      console.error("Error adding expense:", error);
      alert("حدث خطأ أثناء حفظ المصروف.");
      setIsProcessing(false);
      return;
    }

    setFormData({
      description: "",
      amount: "",
      person_name: "",
    });

    await refreshExpenses();
    setIsProcessing(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المصروف؟")) {
      return;
    }

    const { error } = await supabase.from("expenses").delete().eq("id", id);

    if (error) {
      console.error("Error deleting expense:", error);
      alert("حدث خطأ أثناء حذف المصروف.");
      return;
    }

    await refreshExpenses();
  };

  const totalExpenses = expenses.reduce(
    (total, expense) => total + Number(expense.amount || 0),
    0
  );

  return (
    <main
      className={`${cairo.className} min-h-screen bg-[#171310] flex flex-col p-6 text-white relative overflow-x-hidden`}
      dir="rtl"
    >
      {/* نسيج الخلفية ونفس التوهج المستخدم في بقية الصفحات */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px)",
        }}
      />
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#3E5C76] opacity-[0.08] rounded-full blur-[110px] pointer-events-none" />

      <div className="w-full max-w-5xl mx-auto z-10 mt-6">
        <div className="flex justify-between items-center mb-8">
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-[#8C8272] hover:text-[#C9A227] transition-colors"
          >
            <BackIcon />
            <span className="text-lg">العودة</span>
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-left"
          >
            <h1
              className={`${arefRuqaa.className} text-4xl font-bold text-[#EDE6D6]`}
            >
              المصروفات
            </h1>
            <div className="flex items-center justify-end gap-3 mt-2">
              <p className="text-sm text-[#8C8272]">
                سجل النفقات اليومية للمحل
              </p>
              <span className="h-px w-10 bg-[repeating-linear-gradient(90deg,#3E5C76_0,#3E5C76_3px,transparent_3px,transparent_6px)] opacity-70" />
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="md:col-span-2 bg-[#1C1611] border border-dashed border-[#3A3128] rounded-sm p-5">
            <p className="text-[#8C8272] text-sm">عدد المصروفات المسجلة</p>
            <p className="text-3xl font-bold text-white mt-2">
              {expenses.length}
            </p>
          </div>

          <div className="bg-[#1C1611] border border-dashed border-[#3E5C76]/50 rounded-sm p-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#3E5C76]" />
              <p className="text-[#8C8272] text-sm">إجمالي المصروفات</p>
            </div>
            <p className="text-2xl font-bold text-[#7FA3C2] mt-2 font-mono">
              {totalExpenses.toLocaleString("en-IQ")} د.ع
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 shadow-2xl"
          >
            <h2
              className={`${arefRuqaa.className} text-xl font-bold text-[#C9A227] mb-6 border-b border-dashed border-[#3A3128] pb-4`}
            >
              تسجيل مصروف جديد
            </h2>

            <form
              onSubmit={handleAddExpense}
              className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
            >
              <div className="md:col-span-2">
                <label className="block text-[#8C8272] text-sm mb-2">
                  التفاصيل / البيان
                </label>

                <input
                  required
                  type="text"
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      description: event.target.value,
                    })
                  }
                  placeholder="مثال: تصليح كهرباء"
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                />
              </div>

              <div>
                <label className="block text-[#8C8272] text-sm mb-2">
                  اسم المنفذ / المستلم
                </label>

                <input
                  required
                  type="text"
                  value={formData.person_name}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      person_name: event.target.value,
                    })
                  }
                  placeholder="مثال: أحمد"
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                />
              </div>

              <div>
                <label className="block text-[#8C8272] text-sm mb-2">
                  المبلغ بالدينار
                </label>

                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={formData.amount}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      amount: event.target.value,
                    })
                  }
                  placeholder="0"
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                />
              </div>

              <div className="md:col-span-4 mt-2">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 px-6 rounded-sm transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                >
                  {isProcessing ? "جاري الحفظ..." : "حفظ المصروف"}
                </button>
              </div>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 shadow-2xl"
          >
            <h3 className="text-xl font-bold text-[#EDE6D6] mb-6 border-b border-dashed border-[#3A3128] pb-4">
              سجل المصروفات
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="text-[#C9A227] border-b border-dashed border-[#3A3128]">
                    <th className="py-4 px-4 font-semibold">التاريخ والوقت</th>
                    <th className="py-4 px-4 font-semibold">البيان</th>
                    <th className="py-4 px-4 font-semibold">
                      بواسطة / المستلم
                    </th>
                    <th className="py-4 px-4 font-semibold">المبلغ</th>
                    <th className="py-4 px-4 font-semibold text-center">
                      إجراء
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-[#665D4E]"
                      >
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : expenses.length > 0 ? (
                    expenses.map((expense) => (
                      <tr
                        key={expense.id}
                        className="border-b border-dashed border-[#3A3128] hover:bg-[#221B14] transition-colors"
                      >
                        <td className="py-4 px-4 text-[#8C8272] text-sm whitespace-nowrap">
                          {new Date(expense.created_at).toLocaleString(
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

                        <td className="py-4 px-4 text-[#EDE6D6]">
                          {expense.description}
                        </td>

                        <td className="py-4 px-4 text-[#8C8272]">
                          {expense.person_name}
                        </td>

                        <td className="py-4 px-4 font-mono text-[#E08A78] font-bold whitespace-nowrap">
                          {Number(expense.amount).toLocaleString("en-IQ")} د.ع
                        </td>

                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="text-[#665D4E] hover:text-[#C1523F] p-2 rounded-sm hover:bg-[#C1523F]/10 transition-colors"
                            aria-label="حذف المصروف"
                          >
                            <DeleteIcon />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-12 text-center text-[#665D4E]"
                      >
                        لا توجد مصروفات مسجلة حتى الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}

const BackIcon = () => (
  <svg
    width="24"
    height="24"
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

const DeleteIcon = () => (
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
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);
