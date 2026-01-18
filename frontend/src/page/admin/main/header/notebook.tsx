import React from "react";
import { TbCurrencyBaht } from "react-icons/tb";
import { FaUsers, FaChargingStation } from "react-icons/fa";
import { Button } from "../../../../component/admin";
import { useStateContext } from "../../../../contexts/ContextProvider";
import {
  ListPayments,
  ListUsers,
  ListEVChargingPayments,
} from "../../../../services";
import { useEffect, useState } from "react";
import { MdOutlineSupervisorAccount } from "react-icons/md";
import { PaymentsInterface } from "../../../../interface/IPayment";
import { EVChargingPayListmentInterface } from "../../../../interface/IEV";

// 👉 นำรูปเข้ามา (แก้ path ตามที่คุณเก็บไฟล์)
import paymentBg from "../../../../assets/solar-profile.png";

const index = () => {
  //@ts-ignore
  const { currentColor, currentMode } = useStateContext();

  // ===== state เดิมตามโครงสร้าง =====
  //@ts-ignore
  const [payments, setPayments] = useState<PaymentsInterface[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [userCount, setUserCount] = useState<number>(0);
  const [employeeCount, setEmployeeCount] = useState<number>(0);

  //@ts-ignore
  const [evPayments, setEvPayments] = useState<EVChargingPayListmentInterface[]>(
    []
  ); //@ts-ignore
  const [salesTotal, setSalesTotal] = useState<number>(0); //@ts-ignore
  const [refundsCount, setRefundsCount] = useState<number>(0);

  const brandBlue = "#2563eb"; // tailwind blue-600

  // ✅ ฟังก์ชันคำนวณ "เงินที่ใช้ไปแล้ว" โดยเอา RemainingPower มาคิดด้วย (ใช้ร่วมกันทั้งไฟล์)
  const calcUsedBahtWithRemain = (payment: any) => {
    const totalPower = Number(payment?.Power) || 0; // kWh ที่ซื้อ
    const remainingPower = Math.max(0, Number(payment?.RemainingPower) || 0); // kWh ที่เหลือ
    const usedPower = Math.max(0, totalPower - remainingPower); // ✅ ใช้ไปแล้ว (kWh)

    const rate = Number(payment?.EVcharging?.Price) || 0; // บาท/kWh
    const paidBaht = Number(payment?.Price) || 0; // บาทที่จ่ายจริง

    let remainingBaht = rate > 0 ? remainingPower * rate : 0;
    if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

    let usedBaht = 0;
    if (paidBaht > 0) {
      usedBaht = Math.max(0, paidBaht - remainingBaht);
    } else if (rate > 0) {
      usedBaht = usedPower * rate;
    }

    return usedBaht;
  };

  useEffect(() => {
    const fetchPayments = async () => {
      const res = await ListPayments();
      if (res) {
        setPayments(res);

        // ❌ ไม่เอายอดรวม Amount มาใช้แล้ว เพราะ Total Payment ต้องคิด remain จาก EVCharging
        // const total = res.reduce((acc, curr) => acc + (curr.Amount || 0), 0);
        // setTotalAmount(total);
      }
    };

    const fetchUsers = async () => {
      const res = await ListUsers();
      if (res) {
        const usersOnly = res.filter(
          (user) => user.UserRole?.RoleName === "User"
        );
        const employees = res.filter(
          (user) =>
            user.UserRole?.RoleName === "Admin" ||
            user.UserRole?.RoleName === "Employee"
        );

        setUserCount(usersOnly.length);
        setEmployeeCount(employees.length);
      }
    };

    const fetchEVPayments = async () => {
      const res = await ListEVChargingPayments();

      // ✅ ถ้าไม่มีข้อมูล EV Charging -> Total Payment = 0 BATH
      if (!Array.isArray(res) || res.length === 0) {
        setEvPayments([]);
        setSalesTotal(0);
        setRefundsCount(0);
        setTotalAmount(0);
        return;
      }

      // ✅ มีข้อมูล EV Charging
      setEvPayments(res);

      // ✅ เปลี่ยนจาก sum(payment.Price) -> sum(usedBaht) (คิด RemainingPower)
      const sales = res.reduce((acc, curr: any) => {
        return acc + calcUsedBahtWithRemain(curr);
      }, 0);

      setSalesTotal(sales);
      setRefundsCount(res.length);

      // ✅ Total Payment = ใช้ไปแล้วจริง (หัก remain แล้ว)
      setTotalAmount(sales);
    };

    fetchPayments();
    fetchUsers();
    fetchEVPayments();
  }, []);

  // ✅ รายการที่ต้องแสดงเสมอ ถึงแม้ไม่มีข้อมูลใน DB/API
  // (แต่เราจะกันซ้ำโดย merge ด้วย "name" ไม่ใช่ id)
  const DEFAULT_CHARGERS = [
    { id: -101, name: "Solar" },
    { id: -102, name: "Grid" },
    // ถ้าคุณมีชื่อแบบ Solar+Grid ด้วย ให้เปิดบรรทัดนี้ได้
    // { id: -103, name: "Solar + Grid" },
  ];

  // ===== summary EV ตามโครงสร้างเดิม =====
  // ✅ ทำให้ Solar / Grid แสดงเสมอ + ห้ามซ้ำ (รวมด้วยชื่อ)
  const evSummary = (() => {
    // 1) base: ใส่ Solar/Grid ไว้ก่อนเสมอ (ยอด = 0)
    const baseByKey = DEFAULT_CHARGERS.reduce((acc, item) => {
      acc[`name:${item.name}`] = { id: item.id, name: item.name, total: 0 };
      return acc;
    }, {} as Record<string, { id: number; name: string; total: number }>);

    // 2) merge ข้อมูลจริงจาก evPayments
    const merged = evPayments.reduce((acc, payment: any) => {
      const realId = payment?.EVcharging?.ID;
      const realName = payment?.EVcharging?.Name ?? "";

      if (!realId) return acc;

      const usedBaht = calcUsedBahtWithRemain(payment);

      // ✅ ถ้าเป็น Solar/Grid → รวมเข้ากับ default เดิม (ไม่สร้างซ้ำ)
      if (realName === "Solar" || realName === "Grid" || realName === "Solar + Grid") {
        const key = `name:${realName}`;

        if (!acc[key]) {
          // เผื่อกรณีมีชื่อ Solar+Grid แต่ไม่ได้เปิดใน DEFAULT_CHARGERS
          acc[key] = { id: realId, name: realName, total: 0 };
        }

        acc[key].total += usedBaht;
        return acc;
      }

      // ✅ อื่น ๆ → ใช้ id เป็น key ปกติ
      const key = `id:${realId}`;
      const name =
        realName && realName.trim().length > 0 ? realName : `EV Charger ${realId}`;

      if (!acc[key]) acc[key] = { id: realId, name, total: 0 };
      acc[key].total += usedBaht;

      return acc;
    }, baseByKey);

    // 3) คืนเป็น array และเรียงให้ Solar/Grid มาก่อนเสมอ
    const arr = Object.values(merged);

    const order = ["Solar", "Grid", "Solar + Grid"];
    arr.sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      const ra = ia === -1 ? 999 : ia;
      const rb = ib === -1 ? 999 : ib;
      return ra - rb;
    });

    return arr;
  })();

  // ===== earningData: เปลี่ยนไอคอน+โทนสีให้ EV blue =====
  const earningData = [
    {
      icon: <FaUsers />, // Customers icon
      amount: userCount.toLocaleString(),
      percentage: "-4%",
      title: "Customers",
      iconColor: "#1d4ed8", // blue-700
      iconBg: "#dbeafe", // blue-100
      pcColor: "red-600",
    },
    {
      icon: <MdOutlineSupervisorAccount />, // Employees icon
      amount: employeeCount.toLocaleString(),
      percentage: "+23%",
      title: "Employees",
      iconColor: "#1d4ed8",
      iconBg: "#e0f2fe", // light-cyan/blue mix
      pcColor: "green-600",
    },

    // ✅ ถ้า total = 0 หรือไม่มีค่า -> แสดง 0.00 BATH
    ...evSummary
      .map((item) => {
        const safeTotal = Number(item?.total) || 0;

        return [
          <FaChargingStation key={`icon-${item.name}`} />, // EV charger icon
          safeTotal.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          "+12%",
          item.name,
          "#1d4ed8",
          "#eff6ff", // blue-50
          "green-600",
        ];
      })
      .map(
        ([icon, amount, percentage, title, iconColor, iconBg, pcColor]) => ({
          icon,
          amount,
          percentage,
          title,
          iconColor,
          iconBg,
          pcColor,
        })
      ),
  ];

  const handleDownloadCSV = async () => {
    const res = await ListPayments();
    if (!res) {
      console.error("Failed to fetch payments");
      return;
    }

    // เปลี่ยนหัว Amount ให้ชัดว่าเป็น BATH
    const headers = ["ID", "User", "Method", "Amount (BATH)", "CreatedAt"];
    const rows = res.map((payment) => [
      payment.ID,
      payment.User?.FirstName ?? "",
      payment.Method?.Medthod ?? "",
      payment.Amount ?? 0,
      new Date(payment.Date).toLocaleString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "payments.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-wrap lg:flex-nowrap justify-center">
      {/* ===== Card บนซ้าย: Total Payment (พื้นหลังเป็นรูป) ===== */}
      <div
        className="relative h-44 rounded-2xl w-full lg:w-80 p-8 pt-9 m-3 border border-blue-100 shadow-sm overflow-hidden"
        style={{
          backgroundImage: `url(${paymentBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* overlay ช่วยให้อ่านง่าย */}
        <div className="absolute inset-0 bg-blue-600/20" />

        {/* เนื้อหาการ์ด */}
        <div className="relative z-10">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-white drop-shadow">Total Payment</p>
              <p className="text-2xl text-white drop-shadow">
                ฿{" "}
                {totalAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-xs text-blue-100">BATH</span>
              </p>
            </div>
            <button
              type="button"
              style={{ backgroundColor: currentColor || brandBlue }}
              className="text-2xl text-white hover:drop-shadow-xl rounded-full p-4"
              aria-label="Total Payment"
              title="Total Payment"
            >
              <TbCurrencyBaht />
            </button>
          </div>

          <div className="mt-6">
            <Button
              color="white"
              bgColor={currentColor || brandBlue}
              text="Download CSV"
              borderRadius="12px"
              onClick={handleDownloadCSV}
            />
          </div>
        </div>
      </div>

      {/* ===== Grid ด้านขวา: สถิติ + EV summary ===== */}
      <div className="flex m-3 flex-wrap justify-center gap-1 items-center">
        <div className="earning-grid">
          {earningData.map((item) => (
            <div
              key={item.title as string}
              className="earning-item bg-white h-44 md:w-44 p-4 pt-9 rounded-2xl border border-blue-100 shadow-sm"
            >
              <button
                type="button"
                style={{
                  color: item.iconColor as string,
                  backgroundColor: item.iconBg as string,
                }}
                className="text-2xl rounded-full p-4 hover:drop-shadow"
                aria-label={item.title as string}
                title={item.title as string}
              >
                {item.icon as React.ReactNode}
              </button>
              <p className="mt-3">
                <span className="text-lg font-semibold text-gray-900">
                  {item.title === "Customers" || item.title === "Employees"
                    ? (item.amount as string)
                    : `฿ ${item.amount}`}
                </span>
                {!(item.title === "Customers" || item.title === "Employees") && (
                  <span className="ml-1 text-[10px] text-blue-600">BATH</span>
                )}
              </p>
              <p className="text-sm text-blue-700 mt-1 font-medium">
                {item.title as string}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default index;
