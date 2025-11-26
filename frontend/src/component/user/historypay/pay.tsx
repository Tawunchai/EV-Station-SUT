import { JSX, useEffect, useMemo, useState } from "react";
import { FaCoins, FaPaypal, FaWallet, FaMoneyBillWave } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import {
  getUserByID,
  apiUrlPicture,
  ListPaymentsByUserID,
  ListPaymentCoinsByUserID,
} from "../../../services";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import type { PaymentCoinInterface } from "../../../interface/IPaymentCoin";
import { message } from "antd";

interface TransactionItem {
  icon: JSX.Element;
  bg: string;
  title: string;
  desc: string;
  amountNum: number;
  amountText: string;
  color: string;
  date?: string;
  displayDate?: string;
  displayTime?: string;
}

interface UserType {
  FirstName: string;
  LastName: string;
  Profile: string;
  Coin: number;
}

const HistoryPay: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserType | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userID, setUserID] = useState<number | undefined>(undefined);

  // ✅ โหลด user จาก JWT cookie
  useEffect(() => {
    const fetchUser = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        const uid = current?.id;
        if (!uid) {
          message.error("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
          navigate("/login");
          return;
        }

        setUserID(uid);
        const res = await getUserByID(uid);
        if (res) {
          setUser({
            FirstName: res.FirstName ?? "",
            LastName: res.LastName ?? "",
            Profile: res.Profile ?? "",
            Coin: res.Coin ?? 0,
          });
        }
      } catch (err) {
        console.error("Error loading user:", err);
        message.error("โหลดข้อมูลผู้ใช้ล้มเหลว");
      }
    };
    fetchUser();
  }, [navigate]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const fmtTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const pickStyleByMethod = (methodId?: number, methodName?: string) => {
    const name = (methodName || "").toLowerCase();
    if (methodId === 2 || name.includes("coin") || name.includes("coins")) {
      return {
        icon: <FaCoins className="text-base text-white" />,
        bg: "bg-yellow-400",
        title: methodName || "Coins",
        desc: "Pay with Coins",
      };
    }
    return {
      icon: <FaPaypal className="text-base text-white" />,
      bg: "bg-blue-500",
      title: methodName || "QR Payment",
      desc: "Pay via PromptPay/QR",
    };
  };

  // ✅ โหลดประวัติการชำระเงินและเติม Coin
  useEffect(() => {
    const fetchHistory = async () => {
      if (!userID) return;
      setLoading(true);
      try {
        const [paymentList, coinList] = await Promise.all([
          ListPaymentsByUserID(userID),
          ListPaymentCoinsByUserID(userID),
        ]);

        const payments = (paymentList ?? []).map((it: any) => {
          const amount = Number(it.Amount) || 0;
          const methodName: string =
            it?.Method?.Method || it?.Method?.Name || "QR Payment";
          const methodId: number | undefined = it?.MethodID;
          const style = pickStyleByMethod(methodId, methodName);
          const dateRaw: string = it?.CreatedAt || it?.Date || "";

          return {
            icon: style.icon,
            bg: style.bg,
            title: style.title,
            desc: style.desc,
            amountNum: amount,
            amountText: `-${fmt(amount)} ฿`,
            color: "text-red-500",
            date: dateRaw,
            displayDate: dateRaw ? fmtDate(dateRaw) : "",
            displayTime: dateRaw ? fmtTime(dateRaw) : "",
          } as TransactionItem;
        });

        const coins = (coinList ?? []).map((it: PaymentCoinInterface) => {
          const amount = Number(it.Amount) || 0;
          const dateRaw: string = it?.CreatedAt || it?.Date || "";
          return {
            icon: <FaMoneyBillWave className="text-white text-base" />,
            bg: "bg-green-500",
            title: "Add Coins",
            desc: `Ref: ${it.ReferenceNumber}`,
            amountNum: amount,
            amountText: `+${fmt(amount)} Coins`,
            color: "text-green-600",
            date: dateRaw,
            displayDate: dateRaw ? fmtDate(dateRaw) : "",
            displayTime: dateRaw ? fmtTime(dateRaw) : "",
          } as TransactionItem;
        });

        const all = [...payments, ...coins].sort((a, b) => {
          const da = a.date ? new Date(a.date).getTime() : 0;
          const db = b.date ? new Date(b.date).getTime() : 0;
          return db - da;
        });

        setTransactions(all);
        const sum = all.reduce((acc, cur) => acc + cur.amountNum, 0);
        setTotalAmount(sum);
      } catch (err) {
        console.error("Error fetching history:", err);
        message.error("โหลดประวัติธุรกรรมล้มเหลว");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [userID]);

  const coinBalance = useMemo(() => user?.Coin ?? 0, [user]);
  const MAX_LIST_HEIGHT = 400;

  return (
    <div className="min-h-screen w-full bg-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden w-full">
        <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
          <button
            onClick={() => navigate(-1)}
            aria-label="ย้อนกลับ"
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M15 18l-6-6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
              <FaWallet className="h-5 w-5 text-white" />
            </span>
            <span className="text-sm md:text-base font-semibold tracking-wide">
              Wallet & History
            </span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="mx-auto w-full max-w-screen-sm md:max-w-6xl px-4 py-4 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 md:gap-6">
          {/* LEFT SUMMARY */}
          <section className="md:col-span-4">
            <div className="md:sticky md:top-[88px] md:space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  {user?.Profile ? (
                    <img
                      src={`${apiUrlPicture}${user.Profile}`}
                      alt="profile"
                      className="h-14 w-14 rounded-full object-cover border-4 border-blue-50"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-blue-50 animate-pulse" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {user
                        ? `${user.FirstName} ${user.LastName}`
                        : "Loading..."}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      My wallet
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/user/add-coins")}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Top up
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-blue-50 p-3">
                    <div className="text-[11px] text-blue-900">
                      Balance (Coins)
                    </div>
                    <div className="mt-1 text-lg font-bold text-blue-700">
                      {fmt(coinBalance)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-3">
                    <div className="text-[11px] text-blue-900">
                      Total transactions
                    </div>
                    <div className="mt-1 text-lg font-bold text-blue-700">
                      {fmt(totalAmount)} ฿
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT HISTORY */}
          <main className="md:col-span-8 mt-4 md:mt-0">
            <div className="mb-2 text-sm md:text-base font-bold text-gray-900">
              Payment history
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 rounded-xl bg-gray-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  No payment history
                </div>
              ) : (
                <>
                  {/* Header (Desktop) */}
                  <div className="hidden md:grid grid-cols-[6fr_2fr_2fr_2.5fr] gap-3 px-5 py-3 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-100">
                    <div>Type / Details</div>
                    <div>Date</div>
                    <div>Time</div>
                    <div className="text-right">Quantity</div>
                  </div>

                  {/* Desktop Rows */}
                  <div
                    className="hidden md:block overflow-y-auto"
                    style={{ maxHeight: `${MAX_LIST_HEIGHT}px` }}
                  >
                    <ul className="divide-y divide-gray-100">
                      {transactions.map((item, idx) => (
                        <li
                          key={idx}
                          className="grid grid-cols-[6fr_2fr_2fr_2.5fr] gap-3 px-5 py-3 hover:bg-gray-50 items-center"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`shrink-0 h-10 w-10 rounded-xl ${item.bg} text-white flex items-center justify-center`}
                            >
                              {item.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-gray-900">
                                {item.title}
                              </div>
                              <div className="truncate text-[12px] text-gray-500">
                                {item.desc}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-gray-700">
                            {item.displayDate}
                          </div>
                          <div className="text-sm text-gray-700">
                            {item.displayTime}
                          </div>
                          <div
                            className={`text-sm font-bold text-right ${item.color}`}
                          >
                            {item.amountText}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Mobile */}
                  <div
                    className="md:hidden"
                    style={{
                      maxHeight: `${MAX_LIST_HEIGHT}px`,
                      overflowY: "auto",
                    }}
                  >
                    <ul className="divide-y divide-gray-100">
                      {transactions.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <div
                            className={`shrink-0 h-10 w-10 rounded-xl ${item.bg} text-white flex items-center justify-center`}
                          >
                            {item.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-sm font-semibold text-gray-900">
                                {item.title}
                              </div>
                              <div
                                className={`text-sm font-bold ${item.color}`}
                              >
                                {item.amountText}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <div className="truncate text-[12px] text-gray-500">
                                {item.desc}
                              </div>
                              {(item.displayDate || item.displayTime) && (
                                <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                                  {item.displayDate}
                                  {item.displayTime
                                    ? ` • ${item.displayTime}`
                                    : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default HistoryPay;
