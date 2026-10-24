"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import html2canvas from "html2canvas-pro";
import { Cairo, Aref_Ruqaa } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "600", "700", "800"],
});

const arefRuqaa = Aref_Ruqaa({
  subsets: ["arabic"],
  weight: ["400", "700"],
});

interface ExpenseForSummary {
  id: number;
  amount: number;
  created_at: string;
}

async function getAllExpensesForSummary(): Promise<ExpenseForSummary[]> {
  const all: ExpenseForSummary[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("expenses")
      .select("id, amount, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as ExpenseForSummary[];
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

interface Product {
  id: number;
  name: string;
  category: string;
  quantity: number;
  price_per_meter: number;
  price_per_roll: number;
}

interface Customer {
  id: string;
  shop_name: string;
  owner_name: string;
}

// Minimal shape of a "دفتر الديون" (loans register) entry, as needed from
// the sales screen. total_amount is the customer's running debt balance.
interface LoanOption {
  id: number;
  shop_name: string;
  owner_name: string;
  total_amount: number;
}

// "mixed" = part of the invoice is paid cash, part is added to the debt
// register (دفتر الديون) for the selected loan account.
type PaymentType = "cash" | "credit" | "mixed";

interface Sale {
  id: number;
  product_id: number;
  customer_id: string | null;
  invoice_number: string | null;
  product_name: string;
  quantity_sold: number;
  sale_type: "meter" | "roll";
  stock_quantity_deducted: number | null;
  roll_size_meters: number | null;
  original_total_price: number;
  actual_total_price: number;
  discount_amount: number;
  payment_type: PaymentType;
  loan_id: number | null;
  // How much of this sale row's actual_total_price was cash vs. credit.
  // Populated for every row (cash rows: cash_amount = actual_total_price;
  // credit rows: credit_amount = actual_total_price; mixed rows: split).
  // May be null on rows written before the columns existed - callers fall
  // back to payment_type in that case.
  cash_amount: number | null;
  credit_amount: number | null;
  created_at: string;
}

interface CartItem {
  product: Product;
  saleType: "meter" | "roll";
  quantity: number;
  rollSizeMeters: number | null;
  metersToDeduct: number;
  total: number;
}

interface ReceiptData {
  invoiceNumber: string;
  createdAt: string;
  items: CartItem[];
  originalTotal: number;
  actualTotal: number;
  discount: number;
  customerName: string | null;
  paymentType: PaymentType;
  loanName: string | null;
  cashAmount: number;
  creditAmount: number;
}

// Editable shop / invoice info, persisted in Supabase (single row, id = 1).
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

const filterPeriods = ["day", "month", "year"] as const;
type FilterPeriod = (typeof filterPeriods)[number];

const emptyNewLoanForm = {
  shop_name: "",
  owner_name: "",
  phone: "",
  location: "",
};

const formatIqd = (amount: number) =>
  `${Number(amount || 0).toLocaleString("en-IQ")} د.ع`;

// Local (not UTC) yyyy-mm-dd, so "today" in the date picker matches the
// shop's clock rather than shifting a day at UTC midnight.
const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// PostgREST returns at most 1,000 rows per request. Fetch every page so the
// recurring-customer search stays complete as the customer list grows.
async function getAllCustomers(): Promise<Customer[]> {
  const pageSize = 1000;
  const allCustomers: Customer[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, shop_name, owner_name")
      .order("shop_name")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as Customer[];
    allCustomers.push(...page);

    if (page.length < pageSize) return allCustomers;
  }
}

// Same pagination guard for the loans register.
async function getAllLoans(): Promise<LoanOption[]> {
  const pageSize = 1000;
  const allLoans: LoanOption[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("loans")
      .select("id, shop_name, owner_name, total_amount")
      .order("shop_name")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as LoanOption[];
    allLoans.push(...page);

    if (page.length < pageSize) return allLoans;
  }
}

async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const { data, error } = await supabase
    .from("invoice_settings")
    .select("id, shop_name, phone_1, phone_2, address, accent_color")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return (data as InvoiceSettings) ?? DEFAULT_INVOICE_SETTINGS;
}

async function getDashboardData(): Promise<{
  products: Product[];
  sales: Sale[];
  customers: Customer[];
  loans: LoanOption[];
  invoiceSettings: InvoiceSettings;
}> {
  const [productsResult, salesResult, customers, loans, invoiceSettings] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, category, quantity, price_per_meter, price_per_roll")
        .order("name"),

      supabase
        .from("sales")
        .select(
          "id, product_id, customer_id, invoice_number, product_name, quantity_sold, sale_type, stock_quantity_deducted, roll_size_meters, original_total_price, actual_total_price, discount_amount, payment_type, loan_id, cash_amount, credit_amount, created_at"
        )
        .order("created_at", { ascending: false }),

      // getAllCustomers() already returns Customer[] (or throws on error),
      // it is not a Supabase query response with .data/.error.
      getAllCustomers(),

      // Same for getAllLoans().
      getAllLoans(),

      // Same for getInvoiceSettings() - resolves to InvoiceSettings directly.
      getInvoiceSettings(),
    ]);

  if (productsResult.error) throw productsResult.error;
  if (salesResult.error) throw salesResult.error;

  return {
    products: (productsResult.data ?? []) as Product[],
    sales: (salesResult.data ?? []) as Sale[],
    customers,
    loans,
    invoiceSettings,
  };
}

export default function Sales() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summaryExpenses, setSummaryExpenses] = useState<ExpenseForSummary[]>(
    []
  );
  const [expensesSummaryError, setExpensesSummaryError] = useState(false);
  const [expensesSummaryLoading, setExpensesSummaryLoading] = useState(true);
  const [showSalesStatistics, setShowSalesStatistics] = useState(false);
  const [currentDayKey, setCurrentDayKey] = useState(() =>
    getLocalDateString(new Date())
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<LoanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("day");
  const [selectedDate, setSelectedDate] = useState(() =>
    getLocalDateString(new Date())
  );

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saleType, setSaleType] = useState<"meter" | "roll">("meter");
  const [quantity, setQuantity] = useState("");
  const [rollSizeMeters, setRollSizeMeters] = useState("");

  // `priceOverride` holds only what the cashier has manually typed.
  // `null` means "no manual edit yet" -> the displayed price is derived
  // from the cart total. This avoids syncing state via a useEffect
  // (setState-in-effect cascading renders) while still letting the
  // field be genuinely emptied by the user.
  const [priceOverride, setPriceOverride] = useState<string | null>(null);

  // نقد / دين / مختلط. Credit and mixed sales both use the loans-register
  // picker below instead of the customer picker; mixed additionally asks
  // how much of the total goes to the debt account.
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [loanSearch, setLoanSearch] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [showNewLoanForm, setShowNewLoanForm] = useState(false);
  const [newLoanForm, setNewLoanForm] = useState(emptyNewLoanForm);

  // Only used when paymentType === "mixed": how much of the total invoice
  // amount should be recorded as debt. `null` means "no manual edit yet".
  const [creditPortionOverride, setCreditPortionOverride] = useState<
    string | null
  >(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<number | null>(null);
  const [expandedInvoices, setExpandedInvoices] = useState<string[]>([]);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editMeters, setEditMeters] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editManualPrice, setEditManualPrice] = useState(false);
  const [savingSale, setSavingSale] = useState(false);

  const receiptRef = useRef<HTMLDivElement>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [isCreatingImage, setIsCreatingImage] = useState(false);

  // Shop / invoice info (name, phones, address, accent color) shown on the
  // printed receipt. Editable through the "تحديث معلومات الفاتورة" modal.
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(
    DEFAULT_INVOICE_SETTINGS
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState<InvoiceSettings>(
    DEFAULT_INVOICE_SETTINGS
  );
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getDashboardData()
      .then(
        ({
          products: fetchedProducts,
          sales: fetchedSales,
          customers: fetchedCustomers,
          loans: fetchedLoans,
          invoiceSettings: fetchedInvoiceSettings,
        }) => {
          if (!isMounted) return;

          setProducts(fetchedProducts);
          setSales(fetchedSales);
          setCustomers(fetchedCustomers);
          setLoans(fetchedLoans);
          setInvoiceSettings(fetchedInvoiceSettings);
          setLoading(false);
        }
      )
      .catch((error: unknown) => {
        console.error("Error fetching dashboard data:", error);

        if (isMounted) {
          alert("حدث خطأ أثناء جلب البيانات.");
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
        products: fetchedProducts,
        sales: fetchedSales,
        customers: fetchedCustomers,
        loans: fetchedLoans,
        invoiceSettings: fetchedInvoiceSettings,
      } = await getDashboardData();

      setProducts(fetchedProducts);
      setSales(fetchedSales);
      setCustomers(fetchedCustomers);
      setLoans(fetchedLoans);
      setInvoiceSettings(fetchedInvoiceSettings);
    } catch (error: unknown) {
      console.error("Error refreshing dashboard data:", error);
      alert("حدث خطأ أثناء تحديث البيانات.");
    }
  };

  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => product.category))]
        .filter(Boolean)
        .sort(),
    [products]
  );

  const categoryProducts = useMemo(
    () => products.filter((product) => product.category === selectedCategory),
    [products, selectedCategory]
  );

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.id.toString() === selectedProductId),
    [products, selectedProductId]
  );

  const filteredCustomersForSale = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    if (!query) return customers;

    return customers.filter((customer) =>
      [customer.shop_name, customer.owner_name].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const filteredLoansForSale = useMemo(() => {
    const query = loanSearch.trim().toLowerCase();

    if (!query) return loans;

    return loans.filter((loan) =>
      [loan.shop_name, loan.owner_name].some((value) =>
        value?.toLowerCase().includes(query)
      )
    );
  }, [loans, loanSearch]);

  const selectedLoan = useMemo(
    () => loans.find((loan) => loan.id.toString() === selectedLoanId) ?? null,
    [loans, selectedLoanId]
  );

  const itemTotal = useMemo(() => {
    if (!selectedProduct || !quantity) return 0;

    const soldQuantity = parseFloat(quantity) || 0;

    if (saleType === "roll") {
      const rollSize = parseFloat(rollSizeMeters) || 0;
      return (
        soldQuantity * rollSize * Number(selectedProduct.price_per_roll || 0)
      );
    }

    return soldQuantity * Number(selectedProduct.price_per_meter || 0);
  }, [selectedProduct, quantity, saleType, rollSizeMeters]);

  const itemMetersToDeduct = useMemo(() => {
    const soldQuantity = parseFloat(quantity) || 0;

    if (saleType === "meter") {
      return soldQuantity;
    }

    const rollSize = parseFloat(rollSizeMeters) || 0;
    return soldQuantity * rollSize;
  }, [quantity, rollSizeMeters, saleType]);

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + item.total, 0),
    [cart]
  );

  // Derived amount received: whatever the cashier typed manually takes
  // priority; otherwise it defaults to the cart total. No effect needed —
  // this recomputes on every render from current state.
  const actualPrice = useMemo(
    () => priceOverride ?? (cartTotal > 0 ? cartTotal.toString() : ""),
    [priceOverride, cartTotal]
  );

  // Total invoice amount as a number, for the mixed-payment math below.
  const totalAmountNumber = useMemo(() => {
    const parsed = parseFloat(actualPrice);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [actualPrice]);

  // How much of the invoice is credit (goes to the loans register) vs.
  // cash, for each payment type:
  // - cash: all cash, no credit
  // - credit: all credit, no cash
  // - mixed: whatever the cashier typed into the credit-portion field,
  //   clamped to [0, total]. The cash portion is always the remainder.
  const creditAmountValue = useMemo(() => {
    if (paymentType === "cash") return 0;
    if (paymentType === "credit") return totalAmountNumber;

    if (creditPortionOverride === null) return 0;
    const parsed = parseFloat(creditPortionOverride);
    if (Number.isNaN(parsed)) return 0;
    return Math.min(Math.max(parsed, 0), totalAmountNumber);
  }, [paymentType, totalAmountNumber, creditPortionOverride]);

  const cashAmountValue = useMemo(
    () => Math.max(0, totalAmountNumber - creditAmountValue),
    [totalAmountNumber, creditAmountValue]
  );

  // Refresh expenses when returning from the expenses page, and when the
  // calendar day changes while this page remains open.
  useEffect(() => {
    let active = true;
    const loadExpenses = async () => {
      try {
        const rows = await getAllExpensesForSummary();
        if (!active) return;
        setSummaryExpenses(rows);
        setExpensesSummaryError(false);
      } catch (error) {
        console.error("Error fetching expenses for sales summary:", error);
        if (active) setExpensesSummaryError(true);
      } finally {
        if (active) setExpensesSummaryLoading(false);
      }
    };
    void loadExpenses();
    const onFocus = () => {
      void loadExpenses();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadExpenses();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      const today = getLocalDateString(new Date());
      setCurrentDayKey(today);
      void loadExpenses();
    }, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  const expensesForSelectedPeriod = useMemo(() => {
    const now = new Date();
    return summaryExpenses.reduce((total, expense) => {
      const date = new Date(expense.created_at);
      const matches =
        filterPeriod === "day"
          ? getLocalDateString(date) === selectedDate
          : filterPeriod === "month"
          ? date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear()
          : date.getFullYear() === now.getFullYear();
      return total + (matches ? Number(expense.amount || 0) : 0);
    }, 0);
  }, [summaryExpenses, filterPeriod, selectedDate, currentDayKey]);

  const filteredSales = useMemo(() => {
    const now = new Date();

    return sales.filter((sale) => {
      const saleDate = new Date(sale.created_at);

      if (filterPeriod === "day") {
        return getLocalDateString(saleDate) === selectedDate;
      }

      if (filterPeriod === "month") {
        return (
          saleDate.getMonth() === now.getMonth() &&
          saleDate.getFullYear() === now.getFullYear()
        );
      }

      return saleDate.getFullYear() === now.getFullYear();
    });
  }, [sales, filterPeriod, selectedDate]);

  const groupedInvoices = useMemo(() => {
    const groups = new Map<string, Sale[]>();
    for (const sale of filteredSales) {
      // Older rows without an invoice number are NEVER grouped together.
      const key = sale.invoice_number || `legacy-${sale.id}`;
      groups.set(key, [...(groups.get(key) || []), sale]);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      items,
      date: items[0].created_at,
      total: items.reduce((n, x) => n + Number(x.actual_total_price || 0), 0),
      customer:
        items[0].loan_id != null
          ? loans.find((x) => x.id === items[0].loan_id)?.shop_name ||
            "زبون دين"
          : customers.find((x) => x.id === items[0].customer_id)?.shop_name ||
            "زبون نقدي",
    }));
  }, [filteredSales, customers, loans]);

  const openEditSale = (sale: Sale) => {
    setEditingSale(sale);
    setEditMeters(String(sale.stock_quantity_deducted ?? sale.quantity_sold));
    setEditPrice(String(sale.actual_total_price));
    setEditManualPrice(false);
  };

  const editCalculatedPrice = editingSale
    ? Number(editMeters || 0) *
      (Number(editingSale.stock_quantity_deducted || 0) > 0
        ? Number(editingSale.original_total_price) /
          Number(editingSale.stock_quantity_deducted)
        : 0)
    : 0;

  const saveEditedSale = async () => {
    if (!editingSale) return;
    const meters = Number(editMeters);
    const price = editManualPrice
      ? Number(editPrice)
      : Math.round(editCalculatedPrice * 100) / 100;
    if (
      !Number.isFinite(meters) ||
      meters <= 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      editPrice.trim() === ""
    ) {
      alert("أدخل أمتاراً وسعراً صحيحين.");
      return;
    }
    setSavingSale(true);
    try {
      const { error } = await supabase.rpc("update_sale_item_meters", {
        p_sale_id: editingSale.id,
        p_new_meters: meters,
        p_new_price: price,
      });
      if (error) throw error;
      await refreshData();
      setEditingSale(null);
    } catch (error) {
      alert(
        `تعذر تعديل المبيعة: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setSavingSale(false);
    }
  };

  const summary = useMemo(
    () =>
      filteredSales.reduce(
        (total, sale) => {
          // Prefer the stored cash/credit split when present (covers cash,
          // credit, and mixed rows alike). Fall back to the old
          // all-or-nothing logic for rows written before these columns
          // existed.
          const cashPart =
            sale.cash_amount != null
              ? Number(sale.cash_amount)
              : sale.payment_type === "credit"
              ? 0
              : Number(sale.actual_total_price || 0);

          const creditPart =
            sale.credit_amount != null
              ? Number(sale.credit_amount)
              : sale.payment_type === "credit"
              ? Number(sale.actual_total_price || 0)
              : 0;

          return {
            totalRevenue:
              total.totalRevenue + Number(sale.actual_total_price || 0),
            totalDiscount:
              total.totalDiscount + Number(sale.discount_amount || 0),
            totalItems: total.totalItems + 1,
            totalMeters:
              total.totalMeters + Number(sale.stock_quantity_deducted || 0),
            totalCash: total.totalCash + cashPart,
            totalCredit: total.totalCredit + creditPart,
          };
        },
        {
          totalRevenue: 0,
          totalDiscount: 0,
          totalItems: 0,
          totalMeters: 0,
          totalCash: 0,
          totalCredit: 0,
        }
      ),
    [filteredSales]
  );

  const getLoanNameForSale = (loanId: number | null) => {
    if (!loanId) return null;
    return loans.find((loan) => loan.id === loanId)?.shop_name ?? null;
  };

  const resetProductForm = () => {
    setSelectedProductId("");
    setSaleType("meter");
    setQuantity("");
    setRollSizeMeters("");
  };

  const resetCustomerSelection = () => {
    setSelectedCustomerId("");
    setCustomerSearch("");
  };

  const resetLoanSelection = () => {
    setSelectedLoanId("");
    setLoanSearch("");
    setShowNewLoanForm(false);
    setNewLoanForm(emptyNewLoanForm);
    setCreditPortionOverride(null);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    resetProductForm();
  };

  const handleSaleTypeChange = (type: "meter" | "roll") => {
    setSaleType(type);

    if (type === "meter") {
      setRollSizeMeters("");
    }
  };

  // Switching بين نقد/دين/مختلط clears whichever side (customer vs. loan)
  // is no longer relevant, so a stale selection can't leak into the sale.
  const handlePaymentTypeChange = (type: PaymentType) => {
    setPaymentType(type);

    if (type === "cash") {
      resetLoanSelection();
    } else {
      resetCustomerSelection();

      if (type === "credit") {
        setCreditPortionOverride(null);
      }
    }
  };

  const addToCart = () => {
    if (!selectedProduct || !quantity) {
      alert("يرجى اختيار القماش وإدخال الكمية.");
      return;
    }

    const soldQuantity = parseFloat(quantity);
    const rollSize = parseFloat(rollSizeMeters);

    if (Number.isNaN(soldQuantity) || soldQuantity <= 0) {
      alert("يرجى إدخال كمية صحيحة.");
      return;
    }

    if (saleType === "roll" && (Number.isNaN(rollSize) || rollSize <= 0)) {
      alert("يرجى تحديد حجم البكرة بالمتر.");
      return;
    }

    if (selectedProduct.quantity < itemMetersToDeduct) {
      alert(`المخزون غير كافٍ. المتوفر: ${selectedProduct.quantity} متر.`);
      return;
    }

    if (cart.some((item) => item.product.id === selectedProduct.id)) {
      alert(
        "هذا القماش موجود بالفعل في السلة. احذفه ثم أضفه من جديد إذا أردت تعديله."
      );
      return;
    }

    setCart((currentCart) => [
      ...currentCart,
      {
        product: selectedProduct,
        saleType,
        quantity: soldQuantity,
        rollSizeMeters: saleType === "roll" ? rollSize : null,
        metersToDeduct: itemMetersToDeduct,
        total: itemTotal,
      },
    ]);

    setPriceOverride(null);
    resetProductForm();
  };

  const removeFromCart = (productId: number) => {
    setCart((currentCart) =>
      currentCart.filter((item) => item.product.id !== productId)
    );

    setPriceOverride(null);
  };

  const clearCart = () => {
    setCart([]);
    setPriceOverride(null);
  };

  const deleteSale = async (sale: Sale) => {
    if (
      !window.confirm(
        `هل تريد حذف بيع «${sale.product_name}» وإرجاع الكمية إلى المستودع؟`
      )
    ) {
      return;
    }

    setDeletingSaleId(sale.id);
    const { error } = await supabase.rpc("delete_sale_and_restore_stock", {
      p_sale_id: sale.id,
    });

    if (error) {
      console.error("Error deleting sale:", error);

      // This RPC also tries to restore the deducted quantity onto the
      // matching product row. If that product was since removed from the
      // inventory, the RPC has nowhere to restore the stock to and fails -
      // and since the whole call is one transaction, the sale never gets
      // deleted either, even though the user just wants the transaction
      // gone. Offer a fallback: delete the sale record directly, without
      // restoring stock, since there is no inventory row left to restore
      // it to.
      const wantsForceDelete = window.confirm(
        `تعذر حذف المبيعة تلقائياً مع إرجاع الكمية إلى المخزون (سبب محتمل: القماش «${sale.product_name}» لم يعد موجوداً في المخزون).\n\nهل تريد حذف الفاتورة فقط بدون إرجاع الكمية إلى المخزون؟`
      );

      if (!wantsForceDelete) {
        setDeletingSaleId(null);
        return;
      }

      const { error: forceDeleteError } = await supabase
        .from("sales")
        .delete()
        .eq("id", sale.id);

      if (forceDeleteError) {
        console.error(
          "Error force-deleting sale without stock restore:",
          forceDeleteError
        );
        alert(`تعذر حذف المبيعة: ${forceDeleteError.message}`);
        setDeletingSaleId(null);
        return;
      }
    }

    await refreshData();
    setDeletingSaleId(null);
  };

  const openSettingsModal = () => {
    setSettingsForm(invoiceSettings);
    setShowSettingsModal(true);
  };

  const saveInvoiceSettings = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!settingsForm.shop_name.trim()) {
      alert("يرجى إدخال اسم المحل.");
      return;
    }

    setSavingSettings(true);

    const { error } = await supabase.from("invoice_settings").upsert({
      id: 1,
      shop_name: settingsForm.shop_name.trim(),
      phone_1: settingsForm.phone_1.trim(),
      phone_2: settingsForm.phone_2.trim(),
      address: settingsForm.address.trim(),
      accent_color: settingsForm.accent_color,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error saving invoice settings:", error);
      alert(`تعذر حفظ معلومات الفاتورة: ${error.message}`);
      setSavingSettings(false);
      return;
    }

    setInvoiceSettings(settingsForm);
    setSavingSettings(false);
    setShowSettingsModal(false);
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
      link.download = `فاتورة-${receipt?.invoiceNumber ?? "sale"}.png`;

      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: unknown) {
      console.error("Error creating receipt image:", error);
      alert("تعذر إنشاء صورة الفاتورة.");
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
        `فاتورة-${receipt?.invoiceNumber ?? "sale"}.png`,
        { type: "image/png" }
      );

      if (navigator.canShare?.({ files: [imageFile] })) {
        await navigator.share({
          title: `فاتورة ${invoiceSettings.shop_name}`,
          text: "فاتورة عملية بيع",
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

  const handleCheckout = async (event: React.FormEvent) => {
    event.preventDefault();

    if (cart.length === 0) {
      alert("يرجى إضافة قماش واحد على الأقل إلى السلة.");
      return;
    }

    if (actualPrice === "") {
      alert("يرجى إدخال المبلغ المستلم.");
      return;
    }

    const finalPrice = parseFloat(actualPrice);

    if (Number.isNaN(finalPrice) || finalPrice < 0) {
      alert("يرجى إدخال مبلغ صحيح.");
      return;
    }

    if (paymentType === "credit" || paymentType === "mixed") {
      if (showNewLoanForm) {
        if (!newLoanForm.shop_name.trim()) {
          alert("يرجى إدخال اسم المحل لإضافته إلى دفتر الديون.");
          return;
        }
      } else if (!selectedLoanId) {
        alert("يرجى اختيار اسم من دفتر الديون أو إضافة اسم جديد.");
        return;
      }
    }

    if (
      paymentType === "mixed" &&
      (creditAmountValue <= 0 || cashAmountValue <= 0)
    ) {
      alert(
        "الدفع المختلط يتطلب مبلغاً نقدياً ومبلغاً كديناً أكبر من صفر لكل منهما. إذا كان المبلغ بالكامل نقداً أو ديناً، اختر النوع المناسب بدلاً من ذلك."
      );
      return;
    }

    setIsProcessing(true);

    // For a credit or mixed sale, first resolve (or create) the
    // loans-register entry and raise its balance by the credit portion.
    // This happens before the sale rows are written so we have a loan_id
    // to attach to each of them.
    let loanIdToUse: number | null = null;
    let loanNameForReceipt: string | null = null;

    if (paymentType === "credit" || paymentType === "mixed") {
      const debtAmount = creditAmountValue;

      if (showNewLoanForm) {
        const { data: newLoan, error: newLoanError } = await supabase
          .from("loans")
          .insert({
            shop_name: newLoanForm.shop_name.trim(),
            owner_name: newLoanForm.owner_name.trim(),
            phone: newLoanForm.phone.trim(),
            location: newLoanForm.location.trim(),
            total_amount: debtAmount,
            notes: "",
          })
          .select("id, shop_name")
          .single();

        if (newLoanError || !newLoan) {
          console.error("Error creating loan entry:", newLoanError);
          alert("تعذر إضافة الاسم إلى دفتر الديون.");
          setIsProcessing(false);
          return;
        }

        loanIdToUse = newLoan.id;
        loanNameForReceipt = newLoan.shop_name;
      } else {
        const existingLoan = loans.find(
          (loan) => loan.id.toString() === selectedLoanId
        );

        if (!existingLoan) {
          alert("تعذر العثور على الاسم المحدد في دفتر الديون.");
          setIsProcessing(false);
          return;
        }

        const { error: updateLoanError } = await supabase
          .from("loans")
          .update({ total_amount: existingLoan.total_amount + debtAmount })
          .eq("id", existingLoan.id);

        if (updateLoanError) {
          console.error("Error updating loan balance:", updateLoanError);
          alert("تعذر تحديث رصيد الدين.");
          setIsProcessing(false);
          return;
        }

        loanIdToUse = existingLoan.id;
        loanNameForReceipt = existingLoan.shop_name;
      }
    }

    const invoiceNumber = `INV-${Date.now()}`;
    const customerIdToSave =
      paymentType === "cash" ? selectedCustomerId || null : null;

    const saleRows = cart.map((item) => {
      const actualItemPrice =
        cartTotal > 0 ? (item.total / cartTotal) * finalPrice : 0;

      // Split this row's price the same way the overall invoice is split
      // between cash and credit, so per-item records stay consistent with
      // the invoice total.
      const itemCashAmount =
        finalPrice > 0 ? (actualItemPrice / finalPrice) * cashAmountValue : 0;
      const itemCreditAmount =
        finalPrice > 0 ? (actualItemPrice / finalPrice) * creditAmountValue : 0;

      return {
        product_id: item.product.id,
        product_name: item.product.name,
        quantity_sold: item.quantity,
        sale_type: item.saleType,
        original_total_price: item.total,
        actual_total_price: actualItemPrice,
        customer_id: customerIdToSave,
        invoice_number: invoiceNumber,
        stock_quantity_deducted: item.metersToDeduct,
        payment_type: paymentType,
        loan_id: loanIdToUse,
        cash_amount: itemCashAmount,
        credit_amount: itemCreditAmount,
      };
    });

    const { error: saleError } = await supabase.from("sales").insert(saleRows);

    if (saleError) {
      console.error("Error recording sales:", {
        message: saleError.message,
        details: saleError.details,
        hint: saleError.hint,
        code: saleError.code,
      });
      alert(`حدث خطأ أثناء حفظ الفاتورة: ${saleError.message || "غير معروف"}`);
      setIsProcessing(false);
      return;
    }

    const stockUpdates = await Promise.all(
      cart.map((item) =>
        supabase
          .from("products")
          .update({
            quantity: item.product.quantity - item.metersToDeduct,
          })
          .eq("id", item.product.id)
      )
    );

    const stockError = stockUpdates.find((result) => result.error)?.error;

    if (stockError) {
      console.error("Error updating stock:", stockError);
      alert("تم تسجيل البيع، لكن فشل تحديث جزء من المخزون.");
      setIsProcessing(false);
      return;
    }

    setReceipt({
      invoiceNumber,
      createdAt: new Date().toISOString(),
      items: cart,
      originalTotal: cartTotal,
      actualTotal: finalPrice,
      discount: Math.max(0, cartTotal - finalPrice),
      customerName:
        paymentType === "cash" ? selectedCustomer?.shop_name ?? null : null,
      paymentType,
      loanName: loanNameForReceipt,
      cashAmount: cashAmountValue,
      creditAmount: creditAmountValue,
    });

    setCart([]);
    setSelectedCategory("");
    resetProductForm();
    resetCustomerSelection();
    resetLoanSelection();
    setPaymentType("cash");
    setPriceOverride(null);

    await refreshData();
    setIsProcessing(false);
  };

  return (
    <>
      <main
        className={`${cairo.className} h-[100dvh] overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#171310] flex flex-col p-6 pb-12 text-white relative`}
        dir="rtl"
      >
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px)",
          }}
        />

        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#C9A227] opacity-[0.05] rounded-full blur-[120px] pointer-events-none" />

        <div className="flex justify-between items-center mb-8 z-10 mt-4 max-w-7xl mx-auto w-full">
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-[#8C8272] hover:text-[#C9A227] transition-colors"
          >
            <BackIcon />
            <span className="text-lg">العودة للرئيسية</span>
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-left"
          >
            <h1
              className={`${arefRuqaa.className} text-4xl font-bold text-[#EDE6D6]`}
            >
              نقطة البيع
            </h1>
            <p className="text-sm text-[#8C8272] mt-2">
              إصدار الفواتير وإدارة الأرباح
            </p>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={openSettingsModal}
            className="flex items-center gap-2 text-[#8C8272] hover:text-[#C9A227] transition-colors"
          >
            <span className="hidden sm:inline text-sm">
              تحديث معلومات الفاتورة
            </span>
            <SettingsIcon />
          </motion.button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto w-full z-10">
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full lg:w-[42%] bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-8 shadow-2xl"
          >
            <h2 className="text-2xl font-bold text-[#C9A227] mb-6 flex items-center gap-3">
              <CartIcon />
              فاتورة جديدة
            </h2>

            <form onSubmit={handleCheckout} className="flex flex-col gap-5">
              <div className="bg-[#221B14] border border-dashed border-[#C9A227]/30 rounded-sm p-4">
                <label className="block text-[#C9A227] text-sm font-bold mb-2">
                  نوع البيع
                </label>

                <div className="flex bg-[#0E0B08] rounded-sm p-1 border border-[#3A3128]">
                  <button
                    type="button"
                    onClick={() => handlePaymentTypeChange("cash")}
                    className={`flex-1 py-3 rounded-sm font-medium transition-colors text-sm sm:text-base ${
                      paymentType === "cash"
                        ? "bg-[#C9A227] text-[#171310]"
                        : "text-[#8C8272] hover:text-white"
                    }`}
                  >
                    نقد
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePaymentTypeChange("credit")}
                    className={`flex-1 py-3 rounded-sm font-medium transition-colors text-sm sm:text-base ${
                      paymentType === "credit"
                        ? "bg-[#C1523F] text-white"
                        : "text-[#8C8272] hover:text-white"
                    }`}
                  >
                    دين (بالأجل)
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePaymentTypeChange("mixed")}
                    className={`flex-1 py-3 rounded-sm font-medium transition-colors text-sm sm:text-base ${
                      paymentType === "mixed"
                        ? "bg-[#7FA3C2] text-[#171310]"
                        : "text-[#8C8272] hover:text-white"
                    }`}
                  >
                    مختلط (نقد + دين)
                  </button>
                </div>
              </div>

              {paymentType === "cash" ? (
                <div className="bg-[#221B14] border border-dashed border-[#C9A227]/30 rounded-sm p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[#C9A227] text-sm font-bold">
                      الزبون (اختياري)
                    </label>

                    <button
                      type="button"
                      onClick={() => router.push("/customers")}
                      className="text-xs text-[#8C8272] hover:text-[#C9A227] transition-colors"
                    >
                      + زبون جديد
                    </button>
                  </div>

                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="ابحث عن اسم المحل أو صاحبه..."
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 mb-2 focus:outline-none focus:border-[#C9A227]"
                  />

                  <select
                    value={selectedCustomerId}
                    onChange={(event) =>
                      setSelectedCustomerId(event.target.value)
                    }
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                  >
                    <option value="">-- بدون زبون (بيع عابر) --</option>

                    {filteredCustomersForSale.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.shop_name}
                        {customer.owner_name ? ` — ${customer.owner_name}` : ""}
                      </option>
                    ))}
                  </select>

                  {selectedCustomer && (
                    <p className="text-xs text-[#8C8272] mt-2">
                      سيتم تسجيل هذه الفاتورة ضمن سجل مشتريات{" "}
                      <span className="text-[#C9A227] font-bold">
                        {selectedCustomer.shop_name}
                      </span>
                      .
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-[#221B14] border border-dashed border-[#C1523F]/40 rounded-sm p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[#E08A78] text-sm font-bold">
                      دفتر الديون (اختر الزبون)
                    </label>

                    {!showNewLoanForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewLoanForm(true);
                          setSelectedLoanId("");
                        }}
                        className="text-xs text-[#8C8272] hover:text-[#E08A78] transition-colors"
                      >
                        + اسم جديد لم يُسجَّل بعد
                      </button>
                    )}
                  </div>

                  {!showNewLoanForm ? (
                    <>
                      <input
                        type="text"
                        value={loanSearch}
                        onChange={(event) => setLoanSearch(event.target.value)}
                        placeholder="ابحث عن اسم المحل أو صاحبه في دفتر الديون..."
                        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 mb-2 focus:outline-none focus:border-[#E08A78]"
                      />

                      <select
                        value={selectedLoanId}
                        onChange={(event) =>
                          setSelectedLoanId(event.target.value)
                        }
                        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#E08A78]"
                      >
                        <option value="">-- اختر من دفتر الديون --</option>

                        {filteredLoansForSale.map((loan) => (
                          <option key={loan.id} value={loan.id}>
                            {loan.shop_name}
                            {loan.owner_name
                              ? ` — ${loan.owner_name}`
                              : ""}{" "}
                            (دين سابق: {formatIqd(loan.total_amount)})
                          </option>
                        ))}
                      </select>

                      {filteredLoansForSale.length === 0 &&
                        loanSearch.trim() !== "" && (
                          <p className="text-xs text-[#8C8272] mt-2">
                            لا يوجد اسم مطابق في دفتر الديون. يمكنك إضافته كاسم
                            جديد.
                          </p>
                        )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <input
                        type="text"
                        value={newLoanForm.shop_name}
                        onChange={(event) =>
                          setNewLoanForm((form) => ({
                            ...form,
                            shop_name: event.target.value,
                          }))
                        }
                        placeholder="اسم المحل *"
                        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#E08A78]"
                      />

                      <input
                        type="text"
                        value={newLoanForm.owner_name}
                        onChange={(event) =>
                          setNewLoanForm((form) => ({
                            ...form,
                            owner_name: event.target.value,
                          }))
                        }
                        placeholder="اسم صاحب المحل"
                        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#E08A78]"
                      />

                      <input
                        type="tel"
                        value={newLoanForm.phone}
                        onChange={(event) =>
                          setNewLoanForm((form) => ({
                            ...form,
                            phone: event.target.value,
                          }))
                        }
                        placeholder="رقم الموبايل"
                        dir="ltr"
                        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#E08A78] font-mono"
                      />

                      <input
                        type="text"
                        value={newLoanForm.location}
                        onChange={(event) =>
                          setNewLoanForm((form) => ({
                            ...form,
                            location: event.target.value,
                          }))
                        }
                        placeholder="موقع المحل"
                        className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#E08A78]"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          setShowNewLoanForm(false);
                          setNewLoanForm(emptyNewLoanForm);
                        }}
                        className="text-xs text-[#8C8272] hover:text-white self-start"
                      >
                        إلغاء والعودة لاختيار اسم موجود
                      </button>
                    </div>
                  )}

                  {paymentType === "mixed" && (
                    <div className="mt-4 pt-4 border-t border-dashed border-[#3A3128]">
                      <label className="block text-[#7FA3C2] text-sm font-bold mb-2">
                        المبلغ الذي سيُسجَّل كدين (من إجمالي الفاتورة)
                      </label>

                      <input
                        type="number"
                        step="1"
                        min="0"
                        max={totalAmountNumber || undefined}
                        disabled={cart.length === 0}
                        value={
                          creditPortionOverride ??
                          (creditAmountValue > 0
                            ? creditAmountValue.toString()
                            : "")
                        }
                        onChange={(event) =>
                          setCreditPortionOverride(event.target.value)
                        }
                        className="w-full bg-[#0E0B08] border border-[#7FA3C2]/50 text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#7FA3C2] disabled:opacity-50"
                        placeholder="مثال: 25000"
                      />

                      <div className="flex justify-between text-xs text-[#8C8272] mt-2">
                        <span>
                          نقداً:{" "}
                          <span className="text-[#8FB08A] font-mono">
                            {formatIqd(cashAmountValue)}
                          </span>
                        </span>

                        <span>
                          ديناً:{" "}
                          <span className="text-[#E08A78] font-mono">
                            {formatIqd(creditAmountValue)}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-[#8C8272] mt-3">
                    {paymentType === "mixed"
                      ? "سيتم تسجيل الجزء المحدد أعلاه كدين، والباقي يُعتبر مبلغاً نقدياً مستلماً، "
                      : "سيتم تسجيل مبلغ هذه الفاتورة كدين "}
                    {showNewLoanForm ? (
                      "على اسم جديد سيُضاف إلى دفتر الديون."
                    ) : selectedLoan ? (
                      <>
                        على حساب{" "}
                        <span className="text-[#E08A78] font-bold">
                          {selectedLoan.shop_name}
                        </span>
                        .
                      </>
                    ) : (
                      "بعد اختيار الاسم."
                    )}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[#8C8272] text-sm mb-2">
                  1. اختر التصنيف
                </label>

                <select
                  value={selectedCategory}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-4 px-4 focus:outline-none focus:border-[#C9A227]"
                >
                  <option value="">-- اختر التصنيف --</option>

                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8C8272] text-sm mb-2">
                  2. اختر القماش
                </label>

                <select
                  disabled={!selectedCategory}
                  value={selectedProductId}
                  onChange={(event) => setSelectedProductId(event.target.value)}
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-4 px-4 focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                >
                  <option value="">
                    {selectedCategory
                      ? "-- اختر القماش --"
                      : "-- اختر التصنيف أولاً --"}
                  </option>

                  {categoryProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — المتوفر: {product.quantity} متر
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8C8272] text-sm mb-2">
                  طريقة البيع
                </label>

                <div className="flex bg-[#0E0B08] rounded-sm p-1 border border-[#3A3128]">
                  <button
                    type="button"
                    onClick={() => handleSaleTypeChange("meter")}
                    className={`flex-1 py-3 rounded-sm font-medium transition-colors ${
                      saleType === "meter"
                        ? "bg-[#C9A227] text-[#171310]"
                        : "text-[#8C8272] hover:text-white"
                    }`}
                  >
                    بالمتر
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaleTypeChange("roll")}
                    className={`flex-1 py-3 rounded-sm font-medium transition-colors ${
                      saleType === "roll"
                        ? "bg-[#C9A227] text-[#171310]"
                        : "text-[#8C8272] hover:text-white"
                    }`}
                  >
                    رول-توب
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[#8C8272] text-sm mb-2">
                  الكمية ({saleType === "meter" ? "متر" : "بكرة"})
                </label>

                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-4 px-4 focus:outline-none focus:border-[#C9A227]"
                  placeholder={saleType === "meter" ? "مثال: 5" : "مثال: 2"}
                />
              </div>

              {saleType === "roll" && (
                <div className="bg-[#221B14] border border-dashed border-[#C9A227]/30 rounded-sm p-4">
                  <label className="block text-[#C9A227] text-sm mb-2 font-bold">
                    حجم البكرة الواحدة بالمتر
                  </label>

                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={rollSizeMeters}
                    onChange={(event) => setRollSizeMeters(event.target.value)}
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-4 px-4 focus:outline-none focus:border-[#C9A227]"
                    placeholder="مثال: 60"
                  />

                  <p className="text-xs text-[#8C8272] mt-3">
                    سيتم خصم{" "}
                    <span className="text-[#C9A227] font-bold">
                      {itemMetersToDeduct || 0} متر
                    </span>{" "}
                    من المخزون.
                  </p>
                </div>
              )}

              <div className="bg-[#221B14] border border-dashed border-[#3A3128] p-4">
                <div className="flex justify-between items-center">
                  <span className="text-[#8C8272]">سعر هذا المنتج:</span>
                  <span className="font-mono text-[#C9A227]">
                    {formatIqd(itemTotal)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={addToCart}
                className="w-full flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-4 rounded-sm transition-all"
              >
                <PlusIcon />
                إضافة إلى السلة
              </button>

              <div className="bg-[#221B14] border border-dashed border-[#C9A227]/30 rounded-sm p-4">
                <div className="flex justify-between items-center border-b border-dashed border-[#3A3128] pb-3 mb-3">
                  <h3 className="font-bold text-[#C9A227]">
                    السلة ({cart.length})
                  </h3>

                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      تفريغ السلة
                    </button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <p className="text-sm text-[#665D4E] text-center py-3">
                    السلة فارغة حالياً.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto pl-1">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="border-b border-dashed border-[#3A3128] pb-3"
                      >
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-bold text-[#EDE6D6]">
                              {item.product.name}
                            </p>

                            <p className="text-xs text-[#8C8272] mt-1">
                              {item.product.category} · {item.quantity}{" "}
                              {item.saleType === "meter" ? "متر" : "بكرة"}
                              {item.saleType === "roll" &&
                                ` × ${item.rollSizeMeters} متر`}
                            </p>
                          </div>

                          <div className="text-left">
                            <p className="text-[#C9A227] font-mono">
                              {formatIqd(item.total)}
                            </p>

                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="text-xs text-red-400 hover:text-red-300 mt-1"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#221B14] rounded-sm p-5 border border-dashed border-[#C9A227]/40">
                <div className="flex justify-between items-center mb-4 border-b border-dashed border-[#3A3128] pb-4">
                  <span className="text-[#8C8272]">إجمالي السلة:</span>
                  <span className="text-2xl font-mono text-white">
                    {formatIqd(cartTotal)}
                  </span>
                </div>

                <label className="block text-[#C9A227] text-sm mb-2 font-bold">
                  {paymentType === "cash"
                    ? "المبلغ المستلم الفعلي"
                    : paymentType === "credit"
                    ? "المبلغ الذي سيُسجَّل كدين"
                    : "إجمالي الفاتورة (نقد + دين)"}
                </label>

                <input
                  type="number"
                  step="1"
                  min="0"
                  disabled={cart.length === 0}
                  value={actualPrice}
                  onChange={(event) => setPriceOverride(event.target.value)}
                  className="w-full bg-[#0E0B08] border border-[#C9A227]/50 text-[#C9A227] text-xl font-bold rounded-sm py-4 px-4 focus:outline-none focus:border-[#C9A227] disabled:opacity-50"
                  placeholder="المبلغ النهائي..."
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || loading || cart.length === 0}
                className={`w-full flex items-center justify-center gap-2 font-bold py-5 rounded-sm transition-all disabled:opacity-50 ${
                  paymentType === "credit"
                    ? "bg-[#C1523F] hover:bg-[#D06450] text-white"
                    : paymentType === "mixed"
                    ? "bg-[#7FA3C2] hover:bg-[#8FB5D6] text-[#171310]"
                    : "bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310]"
                }`}
              >
                <CartIcon />
                {isProcessing
                  ? "جاري إتمام البيع..."
                  : paymentType === "credit"
                  ? "تسجيل البيع كدين وإصدار الفاتورة"
                  : paymentType === "mixed"
                  ? "تسجيل البيع كدفع مختلط وإصدار الفاتورة"
                  : "إتمام البيع وإصدار الفاتورة"}
              </button>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full lg:w-[58%] flex flex-col gap-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-center md:justify-start gap-4">
              <div className="flex justify-center md:justify-start gap-4">
                {filterPeriods.map((period) => (
                  <button
                    key={period}
                    onClick={() => setFilterPeriod(period)}
                    className={`px-6 py-2 rounded-full border transition-all ${
                      filterPeriod === period
                        ? "bg-[#C9A227] border-[#C9A227] text-[#171310] font-bold"
                        : "bg-transparent border-[#3A3128] text-[#8C8272] hover:border-[#C9A227]/50"
                    }`}
                  >
                    {period === "day"
                      ? "مبيعات يوم محدد"
                      : period === "month"
                      ? "مبيعات الشهر"
                      : "مبيعات السنة"}
                  </button>
                ))}
              </div>

              {filterPeriod === "day" && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm px-4 py-2 focus:outline-none focus:border-[#C9A227] font-mono"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowSalesStatistics(true)}
              className="w-full flex items-center justify-between gap-3 bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm px-5 py-4 text-[#C9A227] hover:bg-[#2A2117] transition-colors font-bold"
            >
              <span>عرض الإحصائيات والأرقام المالية</span>
              <span aria-hidden="true">←</span>
            </button>

            {showSalesStatistics && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="إحصائيات المبيعات"
                className="fixed inset-0 z-[100] bg-[#171310] text-white overflow-y-auto"
                dir="rtl"
              >
                <div className="max-w-6xl mx-auto px-5 py-8">
                  <div className="flex items-center justify-between gap-4 mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-[#C9A227]">
                        إحصائيات المبيعات
                      </h2>
                      <p className="text-[#8C8272] mt-2 text-sm">
                        {filterPeriod === "day"
                          ? `إحصائيات يوم ${selectedDate}`
                          : filterPeriod === "month"
                          ? "إحصائيات الشهر المحدد في شاشة المبيعات"
                          : "إحصائيات السنة المحددة في شاشة المبيعات"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSalesStatistics(false)}
                      className="bg-[#C9A227] text-[#171310] font-bold px-5 py-3 rounded-sm hover:bg-[#D9B84A]"
                    >
                      رجوع للمبيعات
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <SummaryCard
                      title="إجمالي الإيرادات بعد خصم المصروفات"
                      value={
                        expensesSummaryLoading || expensesSummaryError
                          ? "غير متاح"
                          : formatIqd(
                              summary.totalRevenue - expensesForSelectedPeriod
                            )
                      }
                      color="text-white"
                    />

                    <SummaryCard
                      title="الأمتار المباعة"
                      value={`${summary.totalMeters.toLocaleString(
                        "en-IQ"
                      )} متر`}
                      color="text-[#EDE6D6]"
                    />

                    <SummaryCard
                      title="مبيعات نقدية"
                      value={formatIqd(summary.totalCash)}
                      color="text-[#8FB08A]"
                    />

                    <SummaryCard
                      title="مبيعات بالدين"
                      value={formatIqd(summary.totalCredit)}
                      color="text-[#E08A78]"
                    />

                    <SummaryCard
                      title="إجمالي الخصومات"
                      value={formatIqd(summary.totalDiscount)}
                      color="text-[#E08A78]"
                    />

                    <SummaryCard
                      title="عدد عمليات البيع"
                      value={`${groupedInvoices.length} عملية`}
                      color="text-[#7FA3C2]"
                    />
                  </div>
                  <p className="text-sm text-[#8C8272] mb-5">
                    {expensesSummaryLoading
                      ? "جاري تحميل المصروفات لحساب الإيرادات بعد الخصم..."
                      : expensesSummaryError
                      ? "تعذّر جلب المصروفات؛ لم يتم عرض إيرادات صافية غير دقيقة."
                      : `إجمالي المبيعات قبل المصروفات: ${formatIqd(
                          summary.totalRevenue
                        )} — مصروفات الفترة المحددة: ${formatIqd(
                          expensesForSelectedPeriod
                        )}. الإيرادات المعروضة أعلاه بعد خصم هذه المصروفات، وتشمل المبيعات بالدين وليست النقد المقبوض فقط.`}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-[#EDE6D6] mb-6 border-b border-dashed border-[#3A3128] pb-4">
                سجل المبيعات (
                {filterPeriod === "day"
                  ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                      "ar-IQ",
                      { year: "numeric", month: "2-digit", day: "2-digit" }
                    )
                  : filterPeriod === "month"
                  ? "الشهر"
                  : "السنة"}
                )
              </h3>

              <div className="space-y-3">
                {loading ? (
                  <p className="py-10 text-center text-[#C9A227]">
                    جاري تحميل المبيعات...
                  </p>
                ) : groupedInvoices.length === 0 ? (
                  <p className="py-10 text-center text-[#8C8272]">
                    لا توجد مبيعات في هذه الفترة.
                  </p>
                ) : (
                  groupedInvoices.map((invoice) => {
                    const expanded = expandedInvoices.includes(invoice.key);
                    return (
                      <div
                        key={invoice.key}
                        className="border border-[#3A3128] bg-[#221B14] rounded-sm overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedInvoices((old) =>
                              expanded
                                ? old.filter((k) => k !== invoice.key)
                                : [...old, invoice.key]
                            )
                          }
                          className="w-full text-right p-4 flex items-center justify-between gap-3 hover:bg-[#2C2319]"
                        >
                          <div>
                            <div className="font-bold text-[#EDE6D6]">
                              {invoice.customer}
                            </div>
                            <div className="text-xs text-[#8C8272] mt-1">
                              {new Date(invoice.date).toLocaleString("ar-IQ")}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[#C9A227] font-bold">
                              {formatIqd(invoice.total)}
                            </span>
                            <span>{expanded ? "▲" : "▼"}</span>
                          </div>
                        </button>
                        {expanded && (
                          <div className="border-t border-[#3A3128] p-3 space-y-3">
                            {invoice.items.map((sale) => (
                              <div
                                key={sale.id}
                                className="p-3 border border-[#3A3128] rounded-sm flex flex-wrap justify-between items-center gap-3"
                              >
                                <div>
                                  <div className="font-bold text-[#C9A227]">
                                    {sale.product_name}
                                  </div>
                                  <div className="text-xs text-[#8C8272] mt-1">
                                    {sale.sale_type === "roll"
                                      ? `${sale.quantity_sold} رول`
                                      : `${sale.quantity_sold} متر`}{" "}
                                    · المجموع{" "}
                                    {sale.stock_quantity_deducted ??
                                      "غير معروف"}{" "}
                                    متر
                                  </div>
                                  <div className="text-sm mt-1">
                                    {formatIqd(sale.actual_total_price)}
                                  </div>
                                </div>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEditSale(sale)}
                                    className="px-3 py-2 bg-[#C9A227] text-[#171310] font-bold rounded-sm"
                                  >
                                    تعديل
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteSale(sale)}
                                    disabled={deletingSaleId === sale.id}
                                    className="text-red-400 disabled:opacity-50"
                                  >
                                    {deletingSaleId === sale.id
                                      ? "جارٍ الحذف"
                                      : "حذف"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <AnimatePresence>
        {editingSale && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
            dir="rtl"
          >
            <div
              className={`${cairo.className} w-full max-w-md bg-[#1C1611] border border-[#C9A227]/40 p-6 rounded-sm text-white space-y-4`}
            >
              <h2 className="text-xl font-bold text-[#C9A227]">
                تعديل {editingSale.product_name}
              </h2>
              <label className="block">
                الأمتار الإجمالية
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={editMeters}
                  onChange={(e) => {
                    setEditMeters(e.target.value);
                    setEditManualPrice(false);
                  }}
                  className="block mt-2 w-full p-3 bg-[#0E0B08] border border-[#3A3128]"
                />
              </label>
              <div className="text-sm text-[#8C8272]">
                السعر المحسوب: {formatIqd(editCalculatedPrice)}
              </div>
              <label className="block">
                السعر النهائي (يمكن تخفيضه يدوياً)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={
                    editManualPrice
                      ? editPrice
                      : String(Math.round(editCalculatedPrice * 100) / 100)
                  }
                  onChange={(e) => {
                    setEditPrice(e.target.value);
                    setEditManualPrice(true);
                  }}
                  className="block mt-2 w-full p-3 bg-[#0E0B08] border border-[#3A3128]"
                />
              </label>
              <p className="text-xs text-[#8C8272]">
                في الرول يتم تعديل مجموع الأمتار مع بقاء عدد الرولات كما هو.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={savingSale}
                  onClick={() => void saveEditedSale()}
                  className="flex-1 p-3 bg-[#C9A227] text-[#171310] font-bold disabled:opacity-50"
                >
                  {savingSale ? "جارٍ الحفظ..." : "حفظ التعديل"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="flex-1 border border-[#3A3128] p-3"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invoice / shop info settings modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
            dir="rtl"
          >
            <div className="min-h-full flex items-center justify-center py-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className={`${cairo.className} w-full max-w-md bg-[#1C1611] border border-dashed border-[#C9A227]/30 rounded-sm p-6 shadow-2xl`}
              >
                <h2 className="text-xl font-bold text-[#C9A227] mb-6 flex items-center gap-2">
                  <SettingsIcon />
                  تحديث معلومات الفاتورة
                </h2>

                <form
                  onSubmit={saveInvoiceSettings}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      اسم المحل
                    </label>
                    <input
                      type="text"
                      value={settingsForm.shop_name}
                      onChange={(event) =>
                        setSettingsForm((form) => ({
                          ...form,
                          shop_name: event.target.value,
                        }))
                      }
                      className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      رقم الهاتف الأول
                    </label>
                    <input
                      type="tel"
                      value={settingsForm.phone_1}
                      onChange={(event) =>
                        setSettingsForm((form) => ({
                          ...form,
                          phone_1: event.target.value,
                        }))
                      }
                      className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227] font-mono"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      رقم الهاتف الثاني
                    </label>
                    <input
                      type="tel"
                      value={settingsForm.phone_2}
                      onChange={(event) =>
                        setSettingsForm((form) => ({
                          ...form,
                          phone_2: event.target.value,
                        }))
                      }
                      className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227] font-mono"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      العنوان
                    </label>
                    <input
                      type="text"
                      value={settingsForm.address}
                      onChange={(event) =>
                        setSettingsForm((form) => ({
                          ...form,
                          address: event.target.value,
                        }))
                      }
                      className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      لون الفاتورة
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settingsForm.accent_color}
                        onChange={(event) =>
                          setSettingsForm((form) => ({
                            ...form,
                            accent_color: event.target.value,
                          }))
                        }
                        className="h-12 w-16 bg-[#0E0B08] border border-[#3A3128] rounded-sm cursor-pointer"
                      />
                      <span className="font-mono text-sm text-[#8C8272]">
                        {settingsForm.accent_color}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 rounded-sm transition-all disabled:opacity-50"
                    >
                      {savingSettings ? "جاري الحفظ..." : "حفظ"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSettingsModal(false)}
                      className="bg-transparent border border-[#3A3128] text-[#8C8272] hover:text-white py-3 rounded-sm transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {receipt && (
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
                      {/* Shop logo - place the image file at public/logo.png */}
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
                      <p className="text-sm text-[#000000] mt-2">
                        وصل مبيعات
                        {receipt.paymentType === "credit"
                          ? " (دين)"
                          : receipt.paymentType === "mixed"
                          ? " (دفع مختلط)"
                          : " (نقد)"}
                      </p>

                      {(invoiceSettings.phone_1 ||
                        invoiceSettings.phone_2 ||
                        invoiceSettings.address) && (
                        <div className="text-xs text-[#000000] mt-3 flex flex-col gap-1">
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
                        <p className="text-[#000000]">رقم وصل</p>
                        <p className="font-bold">{receipt.invoiceNumber}</p>
                      </div>

                      <div className="text-left">
                        <p className="text-[#000000]">التاريخ والوقت</p>
                        <p className="font-bold">
                          {new Date(receipt.createdAt).toLocaleString("ar-IQ", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    {(receipt.customerName || receipt.loanName) && (
                      <div className="text-sm mb-5">
                        <p className="text-[#000000]">
                          {receipt.paymentType === "credit"
                            ? "الزبون (دين مسجَّل على دفتر الديون)"
                            : receipt.paymentType === "mixed"
                            ? "الزبون (دفع مختلط - دين مسجَّل على دفتر الديون)"
                            : "الزبون"}
                        </p>
                        <p className="font-bold">
                          {receipt.customerName ?? receipt.loanName}
                        </p>
                      </div>
                    )}

                    <div
                      className="border-y border-dashed py-4"
                      style={{ borderColor: invoiceSettings.accent_color }}
                    >
                      <div
                        className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs text-[#000000] pb-3 border-b border-dashed"
                        style={{
                          borderColor: `${invoiceSettings.accent_color}99`,
                        }}
                      >
                        <span>القماش</span>
                        <span>الكمية ---</span>
                        <span> ---السعر</span>
                      </div>

                      <div className="space-y-3 pt-3">
                        {receipt.items.map((item) => (
                          <div
                            key={item.product.id}
                            className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm"
                          >
                            <div>
                              <p className="font-bold">{item.product.name}</p>
                              <p className="text-xs text-[#000000]">
                                {item.product.category}
                                {" — "}
                                {item.saleType === "meter"
                                  ? `${item.metersToDeduct} متر`
                                  : `${item.quantity} بكرة × ${item.rollSizeMeters} متر`}
                              </p>
                            </div>

                            <span className="font-bold">{item.quantity}</span>

                            <span className="font-bold text-left">
                              {formatIqd(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 mt-5 text-sm text-[#000000]">
                      <ReceiptRow
                        valueClassName="text-[#000000]"
                        label="الإجمالي قبل الخصم"
                        value={formatIqd(receipt.originalTotal)}
                      />

                      <ReceiptRow
                        label="الخصم"
                        value={formatIqd(receipt.discount)}
                        valueClassName="text-[#b0382b]"
                      />

                      {receipt.paymentType === "mixed" && (
                        <>
                          <ReceiptRow
                            label="المبلغ المستلم نقداً"
                            value={formatIqd(receipt.cashAmount)}
                            valueClassName="text-[#4c7a49]"
                          />

                          <ReceiptRow
                            label="المبلغ المسجَّل كدين"
                            value={formatIqd(receipt.creditAmount)}
                            valueClassName="text-[#b0382b]"
                          />
                        </>
                      )}

                      <div
                        className="flex justify-between items-center border-t border-dashed pt-4"
                        style={{ borderColor: invoiceSettings.accent_color }}
                      >
                        <span className="font-bold text-lg">
                          {receipt.paymentType === "credit"
                            ? "المبلغ المسجَّل كدين"
                            : receipt.paymentType === "mixed"
                            ? "إجمالي الفاتورة"
                            : "المبلغ المستلم"}
                        </span>
                        <span
                          className="font-bold text-2xl"
                          style={{ color: invoiceSettings.accent_color }}
                        >
                          {formatIqd(receipt.actualTotal)}
                        </span>
                      </div>
                    </div>

                    <p className="text-center text-xs text-[#000000] mt-7">
                      شكراً لتسوقكم معنا
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
                    onClick={() => setReceipt(null)}
                    className="col-span-2 text-[#8C8272] hover:text-white py-2 transition-colors"
                  >
                    إغلاق الفاتورة
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SummaryCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 p-5 rounded-sm">
      <p className="text-[#8C8272] mb-2 text-sm">{title}</p>
      <h3 className={`text-xl font-bold font-mono ${color}`}>{value}</h3>
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

const CartIcon = () => (
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
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
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

const SettingsIcon = () => (
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
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);
