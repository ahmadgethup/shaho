"use client";

import { useRouter } from "next/navigation";
import { motion, Variants } from "framer-motion";
import Image from "next/image";
import { ReactNode } from "react";
import { Cairo, Aref_Ruqaa } from "next/font/google";

// ==========================================
// الخطوط: عنوان تقليدي (أريف رقعة) + واجهة عصرية (القاهرة)
// ==========================================
const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "600", "700", "800"],
});

const arefRuqaa = Aref_Ruqaa({
  subsets: ["arabic"],
  weight: ["400", "700"],
});

// ==========================================
// تعريف أنواع البيانات
// ==========================================
interface ModuleItem {
  title: string;
  desc: string;
  icon: ReactNode;
  path: string;
  thread: string; // لون "بكرة الخيط" الخاصة بهذه الوحدة
}

interface DashboardCardProps {
  mod: ModuleItem;
  variants: Variants;
  onClick: () => void;
}

// كل وحدة تُمثَّل كبكرة خيط بلون مختلف، تماماً كرفّ الأقمشة في المحل
const modules: ModuleItem[] = [
  {
    title: "المخزون والموجودات",
    desc: "إدارة كاملة للأقمشة، التصنيفات، والكميات",
    icon: <InventoryIcon />,
    path: "/inventory",
    thread: "#C9A227",
  },
  {
    title: "نقطة البيع",
    desc: "إصدار الفواتير وتسجيل المبيعات فوراً",
    icon: <SalesIcon />,
    path: "/sales",
    thread: "#7A2A2E",
  },
  {
    title: "المندوبين",
    desc: "متابعة حسابات وعمولات المندوبين",
    icon: <RepIcon />,
    path: "/representatives",
    thread: "#4C6B4F",
  },
  {
    title: "المصروفات",
    desc: "تسجيل المصروفات اليومية والشهرية",
    icon: <ExpenseIcon />,
    path: "/expenses",
    thread: "#3E5C76",
  },
  {
    title: "الديون والقروض",
    desc: "إدارة الذمم المالية بدقة",
    icon: <LoanIcon />,
    path: "/loans",
    thread: "#A6552D",
  },
  {
    title: "زبائننا",
    desc: " إدارة بيانات العملاء وتاريخ تعاملاتهم",
    icon: <CustomerIcon />,
    path: "/customers",
    thread: "#A9854D",
  },
];

export default function Home() {
  const router = useRouter();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.3 },
    },
  };

  // حركة "فتح طاقة القماش": كل بطاقة تُكشف كأنها تُفرد من لفّة قماش
  const cardVariants: Variants = {
    hidden: { opacity: 0, clipPath: "inset(0 0 0 100%)" },
    show: {
      opacity: 1,
      clipPath: "inset(0 0 0 0%)",
      transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <main
      className={`${cairo.className} min-h-screen bg-[#171310] flex flex-col items-center justify-center p-6 text-white relative overflow-hidden`}
      dir="rtl"
    >
      {/* نسيج الخلفية: تشابك خفيف جداً يوحي بالنسيج، بدل توهجات عائمة عامة */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-45deg, #C9A227 0, #C9A227 1px, transparent 1px, transparent 12px)",
        }}
      />

      {/* توهج دافئ واحد ومقيّد خلف الشعار */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.12, 0.2, 0.12] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[-15%] w-[700px] h-[700px] bg-[#C9A227] rounded-full blur-[160px] pointer-events-none"
      />

      {/* الشعار والترويسة */}
      <div className="text-center mb-16 z-10 flex flex-col items-center mt-10">
        <motion.div
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 1.4, type: "spring", bounce: 0.35 }}
          className="relative w-48 h-48 md:w-56 md:h-56 mb-6 drop-shadow-[0_0_30px_rgba(201,162,39,0.3)]"
        >
          {/* تأكد من وضع صورة الشعار في مجلد public باسم logo.png */}
          <div className="w-full h-full rounded-full border-2 border-[#C9A227]/70 p-2 overflow-hidden bg-[#0E0B08]/60 backdrop-blur-md relative">
            <Image
              src="/logo.png"
              alt="شعار أقمشة هافانا"
              fill
              className="object-contain p-4"
            />
          </div>

          {/* حلقة على هيئة "شريط قياس الخياط" بعلامات دقيقة، تدور ببطء شديد */}
          <motion.svg
            animate={{ rotate: 360 }}
            transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[-6px] w-[calc(100%+12px)] h-[calc(100%+12px)]"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="49"
              fill="none"
              stroke="#C9A227"
              strokeWidth="0.6"
              strokeDasharray="1 3"
              opacity="0.6"
            />
          </motion.svg>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="text-[#C9A227] text-sm md:text-md tracking-[0.4em] uppercase mb-3 font-light"
        >
          نظام الإدارة الشامل والمتقدم
        </motion.h2>

        <motion.h1
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.9 }}
          className={`${arefRuqaa.className} text-5xl md:text-7xl font-bold text-[#EDE6D6] drop-shadow-2xl pb-2`}
        >
          أقمشة هافانه
        </motion.h1>
      </div>

      {/* شبكة الوحدات */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 w-full max-w-5xl z-10 pb-10"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.slice(0, 2).map((mod) => (
            <DashboardCard
              key={mod.path}
              mod={mod}
              variants={cardVariants}
              onClick={() => router.push(mod.path)}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modules.slice(2).map((mod) => (
            <DashboardCard
              key={mod.path}
              mod={mod}
              variants={cardVariants}
              onClick={() => router.push(mod.path)}
            />
          ))}
        </div>
      </motion.div>
    </main>
  );
}

// ==========================================
// مكون البطاقة: طاقة قماش تُفتح، بحدّ مخيط، وزاوية تُطوى عند التمرير
// ==========================================
function DashboardCard({ mod, variants, onClick }: DashboardCardProps) {
  const cssVars = {
    "--thread": mod.thread,
    "--thread-soft": `${mod.thread}26`,
  } as React.CSSProperties;

  return (
    <motion.button
      variants={variants}
      onClick={onClick}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.98 }}
      style={cssVars}
      className="group relative flex flex-col items-start justify-center p-8 h-56 bg-[#1C1611] rounded-sm border border-dashed border-[#C9A227]/25 hover:border-[var(--thread)] transition-colors duration-500 overflow-hidden text-right"
    >
      {/* زاوية مطوية كأنها بطاقة عيّنة قماش، تنفتح عند التمرير لتكشف البطانة */}
      <span
        className="absolute top-0 left-0 w-9 h-9 origin-top-left transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:-translate-x-1 group-hover:rotate-[-10deg]"
        style={{
          background: `linear-gradient(135deg, var(--thread) 50%, transparent 50.5%)`,
        }}
      />

      <div className="w-full flex justify-between items-center mb-6">
        <div className="text-[#59503F] group-hover:text-[var(--thread)] transition-colors duration-500 scale-125">
          {mod.icon}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: mod.thread }}
          />
          <div className="h-9 w-9 rounded-full border border-[#3A3128] flex items-center justify-center group-hover:border-[var(--thread)] group-hover:bg-[var(--thread-soft)] transition-all duration-500">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[#59503F] group-hover:text-[var(--thread)] rotate-180 transition-colors duration-500"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-bold text-[#EDE6D6] group-hover:text-white transition-colors duration-300 w-full text-right mb-2">
        {mod.title}
      </h3>
      <p className="text-sm text-[#8C8272] group-hover:text-[#B3A990] transition-colors duration-300 w-full text-right leading-relaxed">
        {mod.desc}
      </p>
    </motion.button>
  );
}

// ==========================================
// الأيقونات (Icons - SVG)
// كل أيقونة الآن مختلفة وحصرية لشاشتها، بأسلوب موحّد (stroke 1.5, 24x24)
// ==========================================

// المخزون: بكرة/طاقة قماش ملفوفة — أنسب من صندوق عام لمحل أقمشة
function InventoryIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="7" ry="2.5" />
      <path d="M5 5v10c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5V5" />
      <path d="M5 10c0 1.4 3.13 2.5 7 2.5s7-1.1 7-2.5" />
    </svg>
  );
}

// نقطة البيع: بطاقة سعر/فاتورة معلّقة
function SalesIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.82Z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  );
}

// المندوبين: مصافحة — تمثّل اتفاقيات وعمولات المندوبين بشكل مميّز عن الزبائن
function RepIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3 1 11h-2" />
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
      <path d="M3 4h8" />
    </svg>
  );
}

// المصروفات: صندوق نقدي/خزنة
function ExpenseIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

// الديون والقروض: ملف مستحقات مرتبط بالوقت — يوحي بأقساط وآجال
function LoanIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v3.5" />
      <circle cx="17" cy="17" r="4" />
      <path d="M17 15.5V17l1 1" />
    </svg>
  );
}

// زبائننا: مجموعة أشخاص — قاعدة عملاء متعددة، مختلفة بصرياً عن أيقونة المندوبين
function CustomerIcon() {
  return (
    <svg
      width="40"
      height="40"
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
}
