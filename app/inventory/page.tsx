"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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

interface Product {
  id: number;
  name: string;
  category: string;
  quantity: number;
  price_per_meter: number;
  price_per_roll: number;
}

const emptyForm = {
  name: "",
  category: "",
  quantity: "",
  price_per_meter: "",
  price_per_roll: "",
};

const formatIqd = (value: number) =>
  `${Number(value ?? 0).toLocaleString("en-IQ")} د.ع`;

export default function Inventory() {
  const router = useRouter();

  const [nameSearch, setNameSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error fetching products:", error);
      alert("حدث خطأ أثناء جلب البيانات.");
      return;
    }

    setProducts(data ?? []);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInitialProducts() {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("id", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Error fetching products:", error);
        alert("حدث خطأ أثناء جلب البيانات.");
      } else {
        setProducts(data ?? []);
      }

      setLoading(false);
    }

    void loadInitialProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => product.category))]
        .filter(Boolean)
        .sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const normalizedName = nameSearch.trim().toLocaleLowerCase();
    const normalizedCategory = categorySearch.trim().toLocaleLowerCase();

    return products.filter((product) => {
      const matchesName =
        !normalizedName ||
        product.name.toLocaleLowerCase().includes(normalizedName);

      const matchesCategory =
        !normalizedCategory ||
        product.category.toLocaleLowerCase().includes(normalizedCategory);

      return matchesName && matchesCategory;
    });
  }, [products, nameSearch, categorySearch]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      quantity: String(product.quantity),
      price_per_meter: String(product.price_per_meter),
      price_per_roll: String(product.price_per_roll),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { name, category, quantity, price_per_meter, price_per_roll } =
      formData;

    if (!name.trim() || !category.trim()) {
      alert("يرجى تعبئة اسم القماش والتصنيف.");
      return;
    }

    const productData = {
      name: name.trim(),
      category: category.trim(),
      quantity: parseFloat(quantity) || 0,
      price_per_meter: parseFloat(price_per_meter) || 0,
      price_per_roll: parseFloat(price_per_roll) || 0,
    };

    const { error } = editingProduct
      ? await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id)
      : await supabase.from("products").insert([productData]);

    if (error) {
      console.error("Error saving product:", error);
      alert(
        editingProduct
          ? "حدث خطأ أثناء تعديل القماش."
          : "حدث خطأ أثناء إضافة القماش."
      );
      return;
    }

    closeModal();
    await loadProducts();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا القماش بشكل نهائي؟")) {
      return;
    }

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      console.error("Error deleting product:", error);
      alert("حدث خطأ أثناء الحذف.");
      return;
    }

    await loadProducts();
  };

  const clearFilters = () => {
    setNameSearch("");
    setCategorySearch("");
  };

  const hasActiveFilters =
    nameSearch.trim() !== "" || categorySearch.trim() !== "";

  return (
    <main
      className={`${cairo.className} min-h-screen bg-[#171310] flex flex-col items-center p-6 text-white relative overflow-hidden`}
      dir="rtl"
    >
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px)",
        }}
      />
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#C9A227] opacity-[0.07] rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-6xl z-10 mt-10">
        <div className="flex justify-between items-center mb-10">
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
              سجل الموجودات
            </h1>

            <div className="flex items-center justify-end gap-3 mt-2">
              <p className="text-sm text-[#8C8272]">إدارة مخزون أقمشة شاهر</p>
              <span className="h-px w-10 bg-[repeating-linear-gradient(90deg,#C9A227_0,#C9A227_3px,transparent_3px,transparent_6px)] opacity-70" />
            </div>
          </motion.div>
        </div>

        <div className="mb-8 bg-[#1C1611] p-4 rounded-sm border border-dashed border-[#C9A227]/25">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#665D4E]">
                  <SearchIcon />
                </div>

                <input
                  type="text"
                  placeholder="ابحث باسم القماش..."
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 pr-12 pl-4 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227] transition-all placeholder-[#665D4E]"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#665D4E]">
                  <CategoryIcon />
                </div>

                <input
                  type="text"
                  list="categories"
                  placeholder="ابحث بالتصنيف..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 pr-12 pl-4 focus:outline-none focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227] transition-all placeholder-[#665D4E]"
                />

                <datalist id="categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            </div>

            <button
              onClick={openAddModal}
              className="w-full lg:w-auto flex items-center justify-center gap-2 bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 px-6 rounded-sm transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(201,162,39,0.15)]"
            >
              <PlusIcon />
              <span>إضافة قماش جديد</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-dashed border-[#3A3128]">
            <p className="text-sm text-[#8C8272]">
              عرض{" "}
              <span className="text-[#C9A227] font-bold">
                {filteredProducts.length}
              </span>{" "}
              من أصل {products.length} منتج
            </p>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 text-sm text-[#C9A227] hover:text-[#EDE6D6] transition-colors"
              >
                <CloseIcon />
                مسح البحث
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#1C1611] rounded-sm border border-dashed border-[#C9A227]/25 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#221B14] border-b border-dashed border-[#3A3128]">
                  <th className="py-5 px-6 text-[#C9A227] font-semibold">
                    الرمز
                  </th>
                  <th className="py-5 px-6 text-[#C9A227] font-semibold">
                    التصنيف
                  </th>
                  <th className="py-5 px-6 text-[#C9A227] font-semibold">
                    اسم القماش
                  </th>

                  <th className="py-5 px-6 text-[#C9A227] font-semibold">
                    الكمية (متر)
                  </th>
                  <th className="py-5 px-6 text-[#C9A227] font-semibold">
                    السعر (للمتر)
                  </th>
                  <th className="py-5 px-6 text-[#C9A227] font-semibold">
                    السعر (للبكرة)
                  </th>
                  <th className="py-5 px-6 text-[#C9A227] font-semibold text-center">
                    الإجراءات
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#C9A227]"
                    >
                      جاري تحميل البيانات...
                    </td>
                  </tr>
                ) : filteredProducts.length > 0 ? (
                  filteredProducts.map((product, index) => (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(index * 0.05, 0.5) }}
                      className={`border-b border-dashed border-[#3A3128] hover:bg-[#221B14] transition-colors ${
                        index % 2 === 0 ? "bg-transparent" : "bg-[#17130F]/60"
                      }`}
                    >
                      <td className="py-4 px-6 text-[#665D4E] font-mono">
                        #{product.id}
                      </td>
                      <td className="py-4 px-6 text-[#8C8272]">
                        <span className="bg-[#221B14] px-3 py-1 rounded-full text-xs border border-[#3A3128]">
                          {product.category}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-[#EDE6D6]">
                        {product.name}
                      </td>

                      <td className="py-4 px-6 text-white font-mono text-lg">
                        {product.quantity}{" "}
                        <span className="text-[#8C8272] text-sm">متر</span>
                      </td>

                      <td className="py-4 px-6 text-[#C9A227] font-mono text-lg">
                        {formatIqd(product.price_per_meter)}
                      </td>

                      <td className="py-4 px-6 text-[#C9A227] font-mono text-lg">
                        {formatIqd(product.price_per_roll)}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(product)}
                            className="text-[#665D4E] hover:text-[#C9A227] transition-colors p-2 rounded-sm hover:bg-[#C9A227]/10"
                            aria-label="تعديل المنتج"
                            title="تعديل"
                          >
                            <EditIcon />
                          </button>

                          <button
                            onClick={() => handleDelete(product.id)}
                            className="text-[#665D4E] hover:text-[#C1523F] transition-colors p-2 rounded-sm hover:bg-[#C1523F]/10"
                            aria-label="حذف المنتج"
                            title="حذف"
                          >
                            <DeleteIcon />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-[#665D4E]"
                    >
                      لا توجد نتائج مطابقة للبحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#1C1611] border border-dashed border-[#C9A227]/40 rounded-sm p-8 w-full max-w-md shadow-[0_0_50px_rgba(201,162,39,0.1)] relative"
            >
              <button
                onClick={closeModal}
                className="absolute top-4 left-4 text-[#665D4E] hover:text-white transition-colors"
                aria-label="إغلاق"
              >
                <CloseIcon />
              </button>

              <h2
                className={`${arefRuqaa.className} text-2xl font-bold text-[#C9A227] mb-1`}
              >
                {editingProduct ? "تعديل بيانات القماش" : "إضافة قماش جديد"}
              </h2>

              <span className="block h-px w-16 bg-[repeating-linear-gradient(90deg,#C9A227_0,#C9A227_3px,transparent_3px,transparent_6px)] opacity-70 mb-6" />

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[#8C8272] text-sm mb-2">
                    اسم القماش
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                    placeholder="مثال: مخمل تركي"
                  />
                </div>

                <div>
                  <label className="block text-[#8C8272] text-sm mb-2">
                    التصنيف
                  </label>
                  <input
                    required
                    type="text"
                    list="form-categories"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                    placeholder="مثال: أقمشة ستائر"
                  />

                  <datalist id="form-categories">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[#8C8272] text-sm mb-2">
                    الكمية (بالمتر)
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: e.target.value,
                      })
                    }
                    className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                    placeholder="0.0"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      السعر (للمتر) د.ع
                    </label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price_per_meter}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          price_per_meter: e.target.value,
                        })
                      }
                      className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-[#8C8272] text-sm mb-2">
                      السعر (للبكرة) د.ع
                    </label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price_per_roll}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          price_per_roll: e.target.value,
                        })
                      }
                      className="w-full bg-[#0E0B08] border border-[#3A3128] text-white rounded-sm py-3 px-4 focus:outline-none focus:border-[#C9A227]"
                      placeholder="0"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#C9A227] hover:bg-[#D9B84A] text-[#171310] font-bold py-3 rounded-sm mt-4 transition-colors"
                >
                  {editingProduct ? "حفظ التعديلات" : "حفظ في المخزون"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

const SearchIcon = () => (
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
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const CategoryIcon = () => (
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
    <path d="M3 7V5a2 2 0 0 1 2-2h2l10 10-4 4L3 7Z" />
    <path d="M7 7h.01" />
    <path d="m13 19 6-6" />
    <path d="m16 16 3 3" />
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

const EditIcon = () => (
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
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

const CloseIcon = () => (
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
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
