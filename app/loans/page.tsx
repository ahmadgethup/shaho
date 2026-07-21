"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import html2canvas from "html2canvas-pro";
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

interface Loan {
  id: number;
  shop_name: string;
  owner_name: string;
  phone: string;
  location: string;
  total_amount: number;
  notes: string;
  created_at: string;
}

interface Payment {
  id: number;
  loan_id: number;
  payment_amount: number;
  created_at: string;
}

interface LoanWithDetails extends Loan {
  paid_amount: number;
  remaining_amount: number;
  status: "unpaid" | "partial" | "paid";
}

// Same shop info used on the sales receipt (public/logo.png, name, phones,
// address, accent color). Stored once in Supabase and shared across pages.
interface InvoiceSettings {
  id: number;
  shop_name: string;
  phone_1: string;
  phone_2: string;
  address: string;
  accent_color: string;
}

const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  id: 1,
  shop_name: "هافانة",
  phone_1: "07701666889",
  phone_2: "07501666889",
  address: "كورنيش كركوك",
  accent_color: "#C9A227",
};

// Everything shown on a payment receipt: who paid, how much was paid now,
// and the full before/after picture of their loan balance.
interface PaymentReceiptData {
  invoiceNumber: string;
  createdAt: string;
  shopName: string;
  ownerName: string;
  phone: string;
  location: string;
  totalAmount: number;
  previousPaidAmount: number;
  paymentAmount: number;
  remainingAmount: number;
  notes: string;
}

const emptyLoan = {
  shop_name: "",
  owner_name: "",
  phone: "",
  location: "",
  total_amount: "",
  notes: "",
};

const formatIqd = (amount: number) =>
  `${Number(amount || 0).toLocaleString("en-IQ")} د.ع`;

async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const { data, error } = await supabase
    .from("invoice_settings")
    .select("id, shop_name, phone_1, phone_2, address, accent_color")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return (data as InvoiceSettings) ?? DEFAULT_INVOICE_SETTINGS;
}

async function getLoansData(): Promise<{
  loans: Loan[];
  payments: Payment[];
  invoiceSettings: InvoiceSettings;
}> {
  const [loansResult, paymentsResult, invoiceSettings] = await Promise.all([
    supabase
      .from("loans")
      .select("*")
      .order("created_at", { ascending: false }),

    supabase
      .from("loan_payments")
      .select("*")
      .order("created_at", { ascending: false }),

    getInvoiceSettings(),
  ]);

  if (loansResult.error) throw loansResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  return {
    loans: (loansResult.data ?? []) as Loan[],
    payments: (paymentsResult.data ?? []) as Payment[],
    invoiceSettings,
  };
}

export default function Loans() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(
    DEFAULT_INVOICE_SETTINGS
  );

  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [paymentModalData, setPaymentModalData] =
    useState<LoanWithDetails | null>(null);
  const [historyModalData, setHistoryModalData] =
    useState<LoanWithDetails | null>(null);

  const [newLoan, setNewLoan] = useState(emptyLoan);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingLoanId, setDeletingLoanId] = useState<number | null>(null);

  // Payment receipt (shown right after a payment is recorded).
  const receiptRef = useRef<HTMLDivElement>(null);
  const [paymentReceipt, setPaymentReceipt] =
    useState<PaymentReceiptData | null>(null);
  const [isCreatingImage, setIsCreatingImage] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getLoansData()
      .then(
        ({
          loans: fetchedLoans,
          payments: fetchedPayments,
          invoiceSettings: fetchedInvoiceSettings,
        }) => {
          if (!isMounted) return;

          setLoans(fetchedLoans);
          setPayments(fetchedPayments);
          setInvoiceSettings(fetchedInvoiceSettings);
          setLoading(false);
        }
      )
      .catch((error: unknown) => {
        console.error("Error fetching loans data:", error);

        if (isMounted) {
          alert("حدث خطأ أثناء جلب بيانات الديون.");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshData = async () => {
    try {
      const {
        loans: fetchedLoans,
        payments: fetchedPayments,
        invoiceSettings: fetchedInvoiceSettings,
      } = await getLoansData();

      setLoans(fetchedLoans);
      setPayments(fetchedPayments);
      setInvoiceSettings(fetchedInvoiceSettings);
    } catch (error: unknown) {
      console.error("Error refreshing loans data:", error);
      alert("حدث خطأ أثناء تحديث البيانات.");
    }
  };

  const loansWithDetails = useMemo<LoanWithDetails[]>(() => {
    return loans.map((loan) => {
      const loanPayments = payments.filter(
        (payment) => payment.loan_id === loan.id
      );

      const paid_amount = loanPayments.reduce(
        (total, payment) => total + Number(payment.payment_amount || 0),
        0
      );

      const remaining_amount = Math.max(
        0,
        Number(loan.total_amount) - paid_amount
      );

      const status: LoanWithDetails["status"] =
        remaining_amount === 0
          ? "paid"
          : paid_amount > 0
          ? "partial"
          : "unpaid";

      return {
        ...loan,
        paid_amount,
        remaining_amount,
        status,
      };
    });
  }, [loans, payments]);

  const summary = useMemo(
    () =>
      loansWithDetails.reduce(
        (total, loan) => ({
          totalGiven: total.totalGiven + Number(loan.total_amount || 0),
          totalRepaid: total.totalRepaid + loan.paid_amount,
          totalRemaining: total.totalRemaining + loan.remaining_amount,
        }),
        {
          totalGiven: 0,
          totalRepaid: 0,
          totalRemaining: 0,
        }
      ),
    [loansWithDetails]
  );

  const historyPayments = useMemo(() => {
    if (!historyModalData) return [];

    return payments.filter(
      (payment) => payment.loan_id === historyModalData.id
    );
  }, [payments, historyModalData]);

  const closeAddLoanModal = () => {
    setIsAddLoanModalOpen(false);
    setNewLoan(emptyLoan);
  };

  const closePaymentModal = () => {
    setPaymentModalData(null);
    setPaymentAmount("");
  };

  const handleAddLoan = async (event: React.FormEvent) => {
    event.preventDefault();

    const amount = parseFloat(newLoan.total_amount);

    if (
      !newLoan.shop_name.trim() ||
      !newLoan.owner_name.trim() ||
      Number.isNaN(amount) ||
      amount <= 0
    ) {
      alert("يرجى إدخال اسم المحل واسم المالك ومبلغ صحيح.");
      return;
    }

    setIsProcessing(true);

    const { error } = await supabase.from("loans").insert([
      {
        shop_name: newLoan.shop_name.trim(),
        owner_name: newLoan.owner_name.trim(),
        phone: newLoan.phone.trim(),
        location: newLoan.location.trim(),
        total_amount: amount,
        notes: newLoan.notes.trim(),
      },
    ]);

    if (error) {
      console.error("Error adding loan:", error);
      alert("حدث خطأ أثناء إضافة القرض.");
      setIsProcessing(false);
      return;
    }

    closeAddLoanModal();
    await refreshData();
    setIsProcessing(false);
  };

  const handleAddPayment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!paymentModalData || !paymentAmount) {
      return;
    }

    const amount = parseFloat(paymentAmount);

    if (Number.isNaN(amount) || amount <= 0) {
      alert("يرجى إدخال مبلغ صحيح.");
      return;
    }

    if (amount > paymentModalData.remaining_amount) {
      alert("مبلغ الدفعة أكبر من المبلغ المتبقي.");
      return;
    }

    setIsProcessing(true);

    const { error } = await supabase.from("loan_payments").insert([
      {
        loan_id: paymentModalData.id,
        payment_amount: amount,
      },
    ]);

    if (error) {
      console.error("Error adding payment:", error);
      alert("حدث خطأ أثناء تسجيل الدفعة.");
      setIsProcessing(false);
      return;
    }

    // Build the payment receipt from the loan snapshot we already had
    // (paymentModalData) plus the amount just paid, before it closes.
    setPaymentReceipt({
      invoiceNumber: `PAY-${Date.now()}`,
      createdAt: new Date().toISOString(),
      shopName: paymentModalData.shop_name,
      ownerName: paymentModalData.owner_name,
      phone: paymentModalData.phone,
      location: paymentModalData.location,
      totalAmount: paymentModalData.total_amount,
      previousPaidAmount: paymentModalData.paid_amount,
      paymentAmount: amount,
      remainingAmount: Math.max(0, paymentModalData.remaining_amount - amount),
      notes: paymentModalData.notes,
    });

    closePaymentModal();
    await refreshData();
    setIsProcessing(false);
  };

  const handleDeleteLoan = async (loan: LoanWithDetails) => {
    if (
      !window.confirm(
        `هل تريد حذف سجل «${loan.shop_name}» نهائياً؟ القرض مكتمل التسديد وسيتم حذف سجل الدفعات الخاص به أيضاً.`
      )
    ) {
      return;
    }

    setDeletingLoanId(loan.id);

    // Delete the payment history first, then the loan itself, in case the
    // database doesn't have an ON DELETE CASCADE set up between the tables.
    const { error: paymentsError } = await supabase
      .from("loan_payments")
      .delete()
      .eq("loan_id", loan.id);

    if (paymentsError) {
      console.error("Error deleting loan payments:", paymentsError);
      alert(`تعذر حذف سجل الدفعات: ${paymentsError.message}`);
      setDeletingLoanId(null);
      return;
    }

    const { error: loanError } = await supabase
      .from("loans")
      .delete()
      .eq("id", loan.id);

    if (loanError) {
      console.error("Error deleting loan:", loanError);
      alert(`تعذر حذف القرض: ${loanError.message}`);
      setDeletingLoanId(null);
      return;
    }

    await refreshData();
    setDeletingLoanId(null);
  };

  const createReceiptImage = async (): Promise<Blob> => {
    if (!receiptRef.current) {
      throw new Error("Receipt element was not found.");
    }

    const canvas = await html2canvas(receiptRef.current, {
      scale: 2,
      backgroundColor: "#fffaf0",
      useCORS: true,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not create receipt image."));
        }
      }, "image/png");
    });
  };

  const downloadReceiptImage = async () => {
    try {
      setIsCreatingImage(true);

      const imageBlob = await createReceiptImage();
      const url = URL.createObjectURL(imageBlob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `وصل-دفعة-${
        paymentReceipt?.invoiceNumber ?? "payment"
      }.png`;

      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: unknown) {
      console.error("Error creating receipt image:", error);
      alert("تعذر إنشاء صورة الوصل.");
    } finally {
      setIsCreatingImage(false);
    }
  };

  const shareReceiptImage = async () => {
    try {
      setIsCreatingImage(true);

      const imageBlob = await createReceiptImage();
      const imageFile = new File(
        [imageBlob],
        `وصل-دفعة-${paymentReceipt?.invoiceNumber ?? "payment"}.png`,
        { type: "image/png" }
      );

      if (navigator.canShare?.({ files: [imageFile] })) {
        await navigator.share({
          title: `وصل تسديد - ${invoiceSettings.shop_name}`,
          text: "وصل تسديد دفعة",
          files: [imageFile],
        });
        return;
      }

      const url = URL.createObjectURL(imageBlob);
      const link = document.createElement("a");

      link.href = url;
      link.download = imageFile.name;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: unknown) {
      console.error("Error sharing receipt:", error);
    } finally {
      setIsCreatingImage(false);
    }
  };

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
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#A6552D] opacity-[0.08] rounded-full blur-[110px] pointer-events-none" />

      <div className="w-full max-w-7xl mx-auto z-10 mt-4">
        <div className="flex justify-between items-center mb-8 border-b border-dashed border-[#3A3128] pb-6">
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-[#8C8272] hover:text-[#C9A227] transition-colors"
          >
            <BackIcon />
            <span>العودة</span>
          </motion.button>

          <div className="text-left">
            <h1
              className={`${arefRuqaa.className} text-4xl font-bold text-[#EDE6D6]`}
            >
              الذمم والقروض
            </h1>
            <div className="flex items-center justify-end gap-3 mt-2">
              <p className="text-sm text-[#8C8272]">
                متابعة حسابات وديون العملاء
              </p>
              <span className="h-px w-10 bg-[repeating-linear-gradient(90deg,#A6552D_0,#A6552D_3px,transparent_3px,transparent_6px)] opacity-70" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <SummaryCard
            title="إجمالي الديون في السوق"
            value={formatIqd(summary.totalGiven)}
            color="text-white"
          />

          <SummaryCard
            title="إجمالي المسدد"
            value={formatIqd(summary.totalRepaid)}
            color="text-[#8FB08A]"
          />

          <SummaryCard
            title="المتبقي في السوق"
            value={formatIqd(summary.totalRemaining)}
            color="text-[#D98C63]"
            accent="#A6552D"
          />
        </div>

        <div className="flex justify-end mb-6">
          <button
            onClick={() => setIsAddLoanModalOpen(true)}
            className="flex items-center gap-2 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 px-6 rounded-sm shadow-[0_0_20px_rgba(201,162,39,0.15)] transition-all hover:scale-105 active:scale-95"
          >
            <PlusIcon />
            <span>تسجيل قرض / دين جديد</span>
          </button>
        </div>

        <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#221B14] text-[#C9A227] border-b border-dashed border-[#3A3128]">
                  <th className="py-4 px-6 font-semibold">المحل / العميل</th>
                  <th className="py-4 px-6 font-semibold">الموبايل والموقع</th>
                  <th className="py-4 px-6 font-semibold">المبلغ الكلي</th>
                  <th className="py-4 px-6 font-semibold">المسدد</th>
                  <th className="py-4 px-6 font-semibold">المتبقي</th>
                  <th className="py-4 px-6 font-semibold">الحالة</th>
                  <th className="py-4 px-6 font-semibold text-center">
                    الإجراءات
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#665D4E]"
                    >
                      جاري التحميل...
                    </td>
                  </tr>
                ) : loansWithDetails.length > 0 ? (
                  loansWithDetails.map((loan) => (
                    <tr
                      key={loan.id}
                      className="border-b border-dashed border-[#3A3128] hover:bg-[#221B14] transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="font-bold text-[#EDE6D6]">
                          {loan.shop_name}
                        </div>
                        <div className="text-sm text-[#8C8272]">
                          {loan.owner_name}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-[#8C8272] text-sm">
                        <div>{loan.phone || "-"}</div>
                        <div>{loan.location || "-"}</div>
                      </td>

                      <td className="py-4 px-6 font-mono text-white whitespace-nowrap">
                        {formatIqd(loan.total_amount)}
                      </td>

                      <td className="py-4 px-6 font-mono text-[#8FB08A] whitespace-nowrap">
                        {formatIqd(loan.paid_amount)}
                      </td>

                      <td className="py-4 px-6 font-mono text-[#D98C63] font-bold whitespace-nowrap">
                        {formatIqd(loan.remaining_amount)}
                      </td>

                      <td className="py-4 px-6">
                        <LoanStatus status={loan.status} />
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex justify-center gap-2">
                          {loan.status !== "paid" && (
                            <button
                              onClick={() => setPaymentModalData(loan)}
                              className="bg-[#C9A227]/10 text-[#C9A227] hover:bg-[#C9A227] hover:text-[#171310] border border-[#C9A227]/30 px-3 py-1.5 rounded-sm text-sm font-bold transition-all"
                            >
                              تسديد دفعة
                            </button>
                          )}

                          <button
                            onClick={() => setHistoryModalData(loan)}
                            className="bg-[#221B14] text-[#B3A990] hover:text-white border border-[#3A3128] hover:border-[#665D4E] px-3 py-1.5 rounded-sm text-sm transition-all flex items-center gap-1"
                          >
                            <HistoryIcon />
                            السجل
                          </button>

                          {loan.status === "paid" && (
                            <button
                              onClick={() => void handleDeleteLoan(loan)}
                              disabled={deletingLoanId === loan.id}
                              className="bg-[#C1523F]/10 text-[#E08A78] hover:bg-[#C1523F] hover:text-white border border-[#C1523F]/30 px-3 py-1.5 rounded-sm text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              <TrashIcon />
                              {deletingLoanId === loan.id
                                ? "جارٍ الحذف..."
                                : "حذف"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#665D4E]"
                    >
                      لا توجد ديون مسجلة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAddLoanModalOpen && (
          <Modal>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-8 w-full max-w-2xl shadow-2xl relative"
            >
              <button
                onClick={closeAddLoanModal}
                className="absolute top-6 left-6 text-[#665D4E] hover:text-white transition-colors"
                aria-label="إغلاق"
              >
                <CloseIcon />
              </button>

              <h2
                className={`${arefRuqaa.className} text-2xl font-bold text-[#C9A227] mb-1`}
              >
                تسجيل قرض / دين جديد
              </h2>
              <span className="block h-px w-16 bg-[repeating-linear-gradient(90deg,#C9A227_0,#C9A227_3px,transparent_3px,transparent_6px)] opacity-70 mb-6" />

              <form
                onSubmit={handleAddLoan}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <InputField
                  label="اسم المحل"
                  required
                  value={newLoan.shop_name}
                  onChange={(value) =>
                    setNewLoan({ ...newLoan, shop_name: value })
                  }
                />

                <InputField
                  label="اسم صاحب المحل"
                  required
                  value={newLoan.owner_name}
                  onChange={(value) =>
                    setNewLoan({ ...newLoan, owner_name: value })
                  }
                />

                <InputField
                  label="رقم الموبايل"
                  value={newLoan.phone}
                  onChange={(value) => setNewLoan({ ...newLoan, phone: value })}
                />

                <InputField
                  label="موقع المحل"
                  value={newLoan.location}
                  onChange={(value) =>
                    setNewLoan({ ...newLoan, location: value })
                  }
                />

                <div className="md:col-span-2">
                  <label className="block text-[#C9A227] font-bold text-sm mb-2">
                    مبلغ القرض الكلي بالدينار
                  </label>

                  <input
                    required
                    min="1"
                    type="number"
                    value={newLoan.total_amount}
                    onChange={(event) =>
                      setNewLoan({
                        ...newLoan,
                        total_amount: event.target.value,
                      })
                    }
                    className="w-full bg-[#0E0B08] border border-[#C9A227]/50 text-[#C9A227] font-bold rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[#8C8272] text-sm mb-2">
                    ملاحظات اختيارية
                  </label>

                  <textarea
                    value={newLoan.notes}
                    onChange={(event) =>
                      setNewLoan({ ...newLoan, notes: event.target.value })
                    }
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227] min-h-[80px]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="md:col-span-2 mt-4 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-4 rounded-sm transition-all disabled:opacity-50"
                >
                  {isProcessing ? "جاري الحفظ..." : "حفظ القرض في السجل"}
                </button>
              </form>
            </motion.div>
          </Modal>
        )}

        {paymentModalData && (
          <Modal>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-8 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={closePaymentModal}
                className="absolute top-4 left-4 text-[#665D4E] hover:text-white transition-colors"
                aria-label="إغلاق"
              >
                <CloseIcon />
              </button>

              <h2
                className={`${arefRuqaa.className} text-2xl font-bold text-[#C9A227] mb-2`}
              >
                تسديد دفعة مالية
              </h2>

              <p className="text-[#8C8272] mb-6">
                لصالح محل:{" "}
                <strong className="text-white">
                  {paymentModalData.shop_name}
                </strong>
              </p>

              <div className="bg-[#221B14] p-4 rounded-sm mb-6 border border-dashed border-[#3A3128]">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#8C8272]">المبلغ الكلي:</span>
                  <span className="text-white">
                    {formatIqd(paymentModalData.total_amount)}
                  </span>
                </div>

                <div className="flex justify-between text-sm font-bold">
                  <span className="text-[#D98C63]">المبلغ المتبقي:</span>
                  <span className="text-[#D98C63]">
                    {formatIqd(paymentModalData.remaining_amount)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleAddPayment} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[#C9A227] text-sm mb-2">
                    مبلغ الدفعة المستلمة الآن بالدينار
                  </label>

                  <input
                    required
                    min="1"
                    type="number"
                    max={paymentModalData.remaining_amount}
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    className="w-full bg-[#0E0B08] border border-[#C9A227] text-[#C9A227] text-xl font-bold rounded-sm py-4 px-4 focus:outline-none"
                    placeholder="0"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full bg-[#4C6B4F] hover:bg-[#5C7F5E] text-white font-bold py-4 rounded-sm transition-all disabled:opacity-50"
                >
                  {isProcessing ? "جاري التسجيل..." : "تأكيد واستلام الدفعة"}
                </button>
              </form>
            </motion.div>
          </Modal>
        )}

        {historyModalData && (
          <Modal>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-6 w-full max-w-lg shadow-2xl relative max-h-[80vh] flex flex-col"
            >
              <button
                onClick={() => setHistoryModalData(null)}
                className="absolute top-4 left-4 text-[#665D4E] hover:text-white transition-colors"
                aria-label="إغلاق"
              >
                <CloseIcon />
              </button>

              <h2
                className={`${arefRuqaa.className} text-xl font-bold text-[#C9A227] mb-2`}
              >
                سجل الدفعات والتسديدات
              </h2>

              <p className="text-[#8C8272] mb-6 text-sm">
                حساب محل:{" "}
                <strong className="text-white">
                  {historyModalData.shop_name}
                </strong>
              </p>

              <div className="overflow-y-auto pr-2">
                {historyPayments.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {historyPayments.map((payment, index) => (
                      <div
                        key={payment.id}
                        className="flex justify-between items-center bg-[#221B14] p-4 rounded-sm border border-dashed border-[#3A3128]"
                      >
                        <div>
                          <div className="text-xs text-[#665D4E] mb-1">
                            الدفعة #{historyPayments.length - index}
                          </div>

                          <div className="text-sm text-[#B3A990]">
                            {new Date(payment.created_at).toLocaleString(
                              "ar-IQ",
                              {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </div>
                        </div>

                        <div className="text-[#8FB08A] font-mono font-bold text-lg">
                          +{formatIqd(payment.payment_amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-[#665D4E] py-10">
                    لم يقم هذا العميل بتسديد أي دفعة بعد.
                  </div>
                )}
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* وصل تسديد الدفعة - يظهر مباشرة بعد تسجيل أي دفعة */}
      <AnimatePresence>
        {paymentReceipt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          >
            <div className="min-h-full flex items-center justify-center py-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-lg"
              >
                <div
                  ref={receiptRef}
                  dir="rtl"
                  className={`${cairo.className} bg-[#fffaf0] text-[#241b12] p-8 shadow-2xl`}
                >
                  <div
                    className="border-2 p-5"
                    style={{ borderColor: invoiceSettings.accent_color }}
                  >
                    <div
                      className="text-center border-b border-dashed pb-5 mb-5 flex flex-col items-center"
                      style={{ borderColor: invoiceSettings.accent_color }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/logo.png"
                        alt={invoiceSettings.shop_name}
                        className="h-20 w-auto object-contain mb-3"
                      />

                      <h2
                        className={`${arefRuqaa.className} text-4xl font-bold`}
                        style={{ color: invoiceSettings.accent_color }}
                      >
                        {invoiceSettings.shop_name}
                      </h2>
                      <p className="text-sm text-[#6b5a46] mt-2">
                        وصل تسديد دفعة
                      </p>

                      {(invoiceSettings.phone_1 ||
                        invoiceSettings.phone_2 ||
                        invoiceSettings.address) && (
                        <div className="text-xs text-[#6b5a46] mt-3 flex flex-col gap-1">
                          {(invoiceSettings.phone_1 ||
                            invoiceSettings.phone_2) && (
                            <p dir="ltr" className="font-mono">
                              {[
                                invoiceSettings.phone_1,
                                invoiceSettings.phone_2,
                              ]
                                .filter(Boolean)
                                .join("  |  ")}
                            </p>
                          )}
                          {invoiceSettings.address && (
                            <p>{invoiceSettings.address}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between gap-4 text-sm mb-5">
                      <div>
                        <p className="text-[#6b5a46]">رقم الوصل</p>
                        <p className="font-bold">
                          {paymentReceipt.invoiceNumber}
                        </p>
                      </div>

                      <div className="text-left">
                        <p className="text-[#6b5a46]">التاريخ والوقت</p>
                        <p className="font-bold">
                          {new Date(paymentReceipt.createdAt).toLocaleString(
                            "ar-IQ",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      </div>
                    </div>

                    <div
                      className="border-y border-dashed py-4 space-y-3 text-sm"
                      style={{ borderColor: invoiceSettings.accent_color }}
                    >
                      <ReceiptRow
                        label="المحل"
                        value={paymentReceipt.shopName}
                      />
                      <ReceiptRow
                        label="صاحب المحل"
                        value={paymentReceipt.ownerName}
                      />
                      {paymentReceipt.phone && (
                        <ReceiptRow
                          label="رقم الموبايل"
                          value={paymentReceipt.phone}
                        />
                      )}
                      {paymentReceipt.location && (
                        <ReceiptRow
                          label="الموقع"
                          value={paymentReceipt.location}
                        />
                      )}
                    </div>

                    <div className="space-y-3 mt-5 text-sm">
                      <ReceiptRow
                        label="إجمالي الدين"
                        value={formatIqd(paymentReceipt.totalAmount)}
                      />

                      <div
                        className="flex justify-between items-center border-t border-dashed pt-4"
                        style={{ borderColor: invoiceSettings.accent_color }}
                      >
                        <span className="font-bold text-lg">
                          المبلغ المستلم الآن
                        </span>
                        <span
                          className="font-bold text-2xl"
                          style={{ color: invoiceSettings.accent_color }}
                        >
                          {formatIqd(paymentReceipt.paymentAmount)}
                        </span>
                      </div>

                      <ReceiptRow
                        label="المتبقي بعد هذه الدفعة"
                        value={formatIqd(paymentReceipt.remainingAmount)}
                        valueClassName="text-[#b0382b] font-bold"
                      />
                    </div>

                    {paymentReceipt.notes && (
                      <p
                        className="text-xs text-[#6b5a46] mt-5 border-t border-dashed pt-4"
                        style={{ borderColor: invoiceSettings.accent_color }}
                      >
                        ملاحظات: {paymentReceipt.notes}
                      </p>
                    )}

                    <p className="text-center text-xs text-[#6b5a46] mt-7">
                      شكراً لتعاملكم معنا
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={downloadReceiptImage}
                    disabled={isCreatingImage}
                    className="flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 px-4 rounded-sm disabled:opacity-50"
                  >
                    <CameraIcon />
                    {isCreatingImage ? "جاري الإنشاء..." : "حفظ كصورة"}
                  </button>

                  <button
                    onClick={shareReceiptImage}
                    disabled={isCreatingImage}
                    className="flex items-center justify-center gap-2 bg-[#1C1611] border border-[#C9A227]/50 hover:bg-[#221B14] text-[#EDE6D6] font-bold py-3 px-4 rounded-sm disabled:opacity-50"
                  >
                    <ShareIcon />
                    مشاركة
                  </button>

                  <button
                    onClick={() => setPaymentReceipt(null)}
                    className="col-span-2 text-[#8C8272] hover:text-white py-2 transition-colors"
                  >
                    إغلاق الوصل
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      {children}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  color,
  accent,
}: {
  title: string;
  value: string;
  color: string;
  accent?: string;
}) {
  return (
    <div
      className="bg-[#1C1611] border border-dashed p-6 rounded-sm relative overflow-hidden"
      style={{ borderColor: accent ? `${accent}4D` : "#3A3128" }}
    >
      <div className="flex items-center gap-2 mb-2">
        {accent && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <p
          className={accent ? "font-bold" : "text-[#8C8272]"}
          style={accent ? { color: accent } : undefined}
        >
          {title}
        </p>
      </div>

      <h3 className={`text-3xl font-bold font-mono ${color}`}>{value}</h3>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#6b5a46]">{label}</span>
      <span className={`font-bold text-left ${valueClassName}`}>{value}</span>
    </div>
  );
}

function InputField({
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
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
      />
    </div>
  );
}

function LoanStatus({ status }: { status: LoanWithDetails["status"] }) {
  if (status === "paid") {
    return (
      <span className="bg-[#4C6B4F]/10 text-[#8FB08A] px-3 py-1 rounded-full text-xs border border-[#4C6B4F]/30">
        مكتمل
      </span>
    );
  }

  if (status === "partial") {
    return (
      <span className="bg-[#C9A227]/10 text-[#C9A227] px-3 py-1 rounded-full text-xs border border-[#C9A227]/30">
        تسديد جزئي
      </span>
    );
  }

  return (
    <span className="bg-[#C1523F]/10 text-[#D98C63] px-3 py-1 rounded-full text-xs border border-[#C1523F]/30">
      غير مسدد
    </span>
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
    width="24"
    height="24"
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

const HistoryIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
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

const CameraIcon = () => (
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
    <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const ShareIcon = () => (
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
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4" />
    <path d="m15.4 6.5-6.8 4" />
  </svg>
);
