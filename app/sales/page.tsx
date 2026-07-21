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

interface Sale {
  id: number;
  product_id: number;
  product_name: string;
  quantity_sold: number;
  sale_type: "meter" | "roll";
  stock_quantity_deducted: number | null;
  original_total_price: number;
  actual_total_price: number;
  discount_amount: number;
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

const formatIqd = (amount: number) =>
  `${Number(amount || 0).toLocaleString("en-IQ")} د.ع`;

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
  invoiceSettings: InvoiceSettings;
}> {
  const [productsResult, salesResult, customers, invoiceSettings] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, category, quantity, price_per_meter, price_per_roll")
        .order("name"),

      supabase
        .from("sales")
        .select(
          "id, product_id, product_name, quantity_sold, sale_type, stock_quantity_deducted, original_total_price, actual_total_price, discount_amount, created_at"
        )
        .order("created_at", { ascending: false }),

      // getAllCustomers() already returns Customer[] (or throws on error),
      // it is not a Supabase query response with .data/.error.
      getAllCustomers(),

      // Same for getInvoiceSettings() - resolves to InvoiceSettings directly.
      getInvoiceSettings(),
    ]);

  if (productsResult.error) throw productsResult.error;
  if (salesResult.error) throw salesResult.error;

  return {
    products: (productsResult.data ?? []) as Product[],
    sales: (salesResult.data ?? []) as Sale[],
    customers,
    invoiceSettings,
  };
}

export default function Sales() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("day");

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

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState<number | null>(null);

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
          invoiceSettings: fetchedInvoiceSettings,
        }) => {
          if (!isMounted) return;

          setProducts(fetchedProducts);
          setSales(fetchedSales);
          setCustomers(fetchedCustomers);
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
        invoiceSettings: fetchedInvoiceSettings,
      } = await getDashboardData();

      setProducts(fetchedProducts);
      setSales(fetchedSales);
      setCustomers(fetchedCustomers);
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

  const itemTotal = useMemo(() => {
    if (!selectedProduct || !quantity) return 0;

    const soldQuantity = parseFloat(quantity) || 0;

    const unitPrice =
      saleType === "meter"
        ? selectedProduct.price_per_meter
        : selectedProduct.price_per_roll;

    return soldQuantity * unitPrice;
  }, [selectedProduct, quantity, saleType]);

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

  const filteredSales = useMemo(() => {
    const now = new Date();

    return sales.filter((sale) => {
      const saleDate = new Date(sale.created_at);

      if (filterPeriod === "day") {
        return saleDate.toDateString() === now.toDateString();
      }

      if (filterPeriod === "month") {
        return (
          saleDate.getMonth() === now.getMonth() &&
          saleDate.getFullYear() === now.getFullYear()
        );
      }

      return saleDate.getFullYear() === now.getFullYear();
    });
  }, [sales, filterPeriod]);

  const summary = useMemo(
    () =>
      filteredSales.reduce(
        (total, sale) => ({
          totalRevenue:
            total.totalRevenue + Number(sale.actual_total_price || 0),
          totalDiscount:
            total.totalDiscount + Number(sale.discount_amount || 0),
          totalItems: total.totalItems + 1,
        }),
        {
          totalRevenue: 0,
          totalDiscount: 0,
          totalItems: 0,
        }
      ),
    [filteredSales]
  );

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
      alert(`تعذر حذف المبيعة: ${error.message}`);
      setDeletingSaleId(null);
      return;
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

    setIsProcessing(true);

    const invoiceNumber = `INV-${Date.now()}`;
    const customerIdToSave = selectedCustomerId || null;

    const saleRows = cart.map((item) => {
      const actualItemPrice =
        cartTotal > 0 ? (item.total / cartTotal) * finalPrice : 0;

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
      customerName: selectedCustomer?.shop_name ?? null,
    });

    setCart([]);
    setSelectedCategory("");
    resetProductForm();
    resetCustomerSelection();
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
                    بالبكرة
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
                  المبلغ المستلم الفعلي
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
                className="w-full flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-5 rounded-sm transition-all disabled:opacity-50"
              >
                <CartIcon />
                {isProcessing
                  ? "جاري إتمام البيع..."
                  : "إتمام البيع وإصدار الفاتورة"}
              </button>
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full lg:w-[58%] flex flex-col gap-6"
          >
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
                    ? "مبيعات اليوم"
                    : period === "month"
                    ? "مبيعات الشهر"
                    : "مبيعات السنة"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <SummaryCard
                title="إجمالي الإيرادات"
                value={formatIqd(summary.totalRevenue)}
                color="text-white"
              />

              <SummaryCard
                title="إجمالي الخصومات"
                value={formatIqd(summary.totalDiscount)}
                color="text-[#E08A78]"
              />

              <SummaryCard
                title="عدد عمليات البيع"
                value={`${summary.totalItems} عملية`}
                color="text-[#7FA3C2]"
              />
            </div>

            <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 rounded-sm p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-[#EDE6D6] mb-6 border-b border-dashed border-[#3A3128] pb-4">
                سجل المبيعات (
                {filterPeriod === "day"
                  ? "اليوم"
                  : filterPeriod === "month"
                  ? "الشهر"
                  : "السنة"}
                )
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="text-[#8C8272] border-b border-dashed border-[#3A3128]">
                      <th className="py-3 px-4 font-normal">التاريخ والوقت</th>
                      <th className="py-3 px-4 font-normal">القماش</th>
                      <th className="py-3 px-4 font-normal">الكمية</th>
                      <th className="py-3 px-4 font-normal">السعر النهائي</th>
                      <th className="py-3 px-4 font-normal text-center">
                        الخصم
                      </th>
                      <th className="py-3 px-4 font-normal text-center">
                        إجراء
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-12 text-center text-[#C9A227]"
                        >
                          جاري تحميل المبيعات...
                        </td>
                      </tr>
                    ) : filteredSales.length > 0 ? (
                      filteredSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="border-b border-dashed border-[#3A3128] hover:bg-[#221B14] transition-colors"
                        >
                          <td className="py-4 px-4 text-sm text-[#8C8272] whitespace-nowrap">
                            {new Date(sale.created_at).toLocaleString("ar-IQ", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>

                          <td className="py-4 px-4 font-medium text-[#C9A227]">
                            {sale.product_name}
                          </td>

                          <td className="py-4 px-4 text-[#B3A990]">
                            {sale.quantity_sold}{" "}
                            <span className="text-xs text-[#665D4E]">
                              {sale.sale_type === "meter" ? "متر" : "بكرة"}
                            </span>
                          </td>

                          <td className="py-4 px-4 font-mono text-white">
                            {formatIqd(sale.actual_total_price)}
                          </td>

                          <td className="py-4 px-4 text-center">
                            {sale.discount_amount > 0 ? (
                              <span className="bg-[#C1523F]/10 text-[#E08A78] px-3 py-1 rounded-full text-xs border border-[#C1523F]/20 font-mono">
                                {formatIqd(sale.discount_amount)}
                              </span>
                            ) : (
                              <span className="text-[#4A4335]">-</span>
                            )}
                          </td>

                          <td className="py-4 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => void deleteSale(sale)}
                              disabled={deletingSaleId === sale.id}
                              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                              {deletingSaleId === sale.id
                                ? "جارٍ الحذف..."
                                : "حذف وإرجاع للمخزون"}
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-12 text-center text-[#665D4E]"
                        >
                          لا توجد مبيعات في هذه الفترة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

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
                      <p className="text-sm text-[#6b5a46] mt-2">
                        فاتورة مبيعات
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
                        <p className="text-[#6b5a46]">رقم الفاتورة</p>
                        <p className="font-bold">{receipt.invoiceNumber}</p>
                      </div>

                      <div className="text-left">
                        <p className="text-[#6b5a46]">التاريخ والوقت</p>
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

                    {receipt.customerName && (
                      <div className="text-sm mb-5">
                        <p className="text-[#6b5a46]">الزبون</p>
                        <p className="font-bold">{receipt.customerName}</p>
                      </div>
                    )}

                    <div
                      className="border-y border-dashed py-4"
                      style={{ borderColor: invoiceSettings.accent_color }}
                    >
                      <div
                        className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs text-[#6b5a46] pb-3 border-b border-dashed"
                        style={{
                          borderColor: `${invoiceSettings.accent_color}99`,
                        }}
                      >
                        <span>القماش</span>
                        <span>الكمية</span>
                        <span>السعر</span>
                      </div>

                      <div className="space-y-3 pt-3">
                        {receipt.items.map((item) => (
                          <div
                            key={item.product.id}
                            className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm"
                          >
                            <div>
                              <p className="font-bold">{item.product.name}</p>
                              <p className="text-xs text-[#6b5a46]">
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

                    <div className="space-y-3 mt-5 text-sm">
                      <ReceiptRow
                        label="الإجمالي قبل الخصم"
                        value={formatIqd(receipt.originalTotal)}
                      />

                      <ReceiptRow
                        label="الخصم"
                        value={formatIqd(receipt.discount)}
                        valueClassName="text-[#b0382b]"
                      />

                      <div
                        className="flex justify-between items-center border-t border-dashed pt-4"
                        style={{ borderColor: invoiceSettings.accent_color }}
                      >
                        <span className="font-bold text-lg">
                          المبلغ المستلم
                        </span>
                        <span
                          className="font-bold text-2xl"
                          style={{ color: invoiceSettings.accent_color }}
                        >
                          {formatIqd(receipt.actualTotal)}
                        </span>
                      </div>
                    </div>

                    <p className="text-center text-xs text-[#6b5a46] mt-7">
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
    <div className="bg-[#1C1611] border border-dashed border-[#C9A227]/25 p-6 rounded-sm">
      <p className="text-[#8C8272] mb-2">{title}</p>
      <h3 className={`text-2xl font-bold font-mono ${color}`}>{value}</h3>
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
