import { useEffect, useState } from "react";
import { FaUsers, FaChargingStation } from "react-icons/fa";
import { MdOutlineSupervisorAccount } from "react-icons/md";
import { Button } from "../../../../component/admin";
import { useStateContext } from "../../../../contexts/ContextProvider";
import {
  ListPayments,
  ListUsers,
  ListEVChargingPayments,
} from "../../../../services";
import type { PaymentsInterface } from "../../../../interface/IPayment";
import type { EVChargingPayListmentInterface } from "../../../../interface/IEV";

// 👉 รูปพื้นหลังเฉพาะ Card แรก
import cardBg from "../../../../assets/solar-profile.png";

const PhoneDashboard = () => {
  //@ts-ignore
  const { currentColor } = useStateContext(); //@ts-ignore
  const [payments, setPayments] = useState<PaymentsInterface[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [userCount, setUserCount] = useState<number>(0);
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [evPayments, setEvPayments] = useState<EVChargingPayListmentInterface[]>(
    []
  );

  const brandBlue = "#2563eb";

  // ✅ ฟังก์ชันคำนวณ "เงินที่ใช้ไปแล้ว" โดยเอา RemainingPower มาคิดด้วย (ใช้ร่วมกันทั้งไฟล์)
  const calcUsedBahtWithRemain = (payment: any) => {
    const totalPower = Number(payment?.Power) || 0; // kWh ที่ซื้อ
    const remainingPower = Math.max(0, Number(payment?.RemainingPower) || 0); // kWh ที่เหลือ
    const usedPower = Math.max(0, totalPower - remainingPower);

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
    const load = async () => {
      const payRes = await ListPayments();
      if (payRes) {
        setPayments(payRes);
        // ❌ เดิม: Total Payment ใช้ Amount รวม (ยังไม่หัก remain)
        // ✅ ตอนนี้จะไป setTotalAmount จาก EV ที่คิด remain แล้วแทน
      }

      const usersRes = await ListUsers();
      if (usersRes) {
        setUserCount(
          usersRes.filter((u) => u.UserRole?.RoleName === "User").length
        );
        setEmployeeCount(
          usersRes.filter(
            (u) =>
              u.UserRole?.RoleName === "Admin" ||
              u.UserRole?.RoleName === "Employee"
          ).length
        );
      }

      const evRes = await ListEVChargingPayments();

      // ✅ ถ้าไม่มีข้อมูล EV Charging -> Total Payment = 0 BATH + ยังต้องโชว์ Solar/Grid เป็น 0
      if (!Array.isArray(evRes) || evRes.length === 0) {
        setEvPayments([]);
        setTotalAmount(0);
        return;
      }

      setEvPayments(evRes);

      // ✅ Total Payment = ยอด "ใช้ไปแล้วจริง" (คิด RemainingPower)
      const usedBahtSum = evRes.reduce((sum, cur: any) => {
        return sum + calcUsedBahtWithRemain(cur);
      }, 0);

      setTotalAmount(usedBahtSum);
    };

    load();
  }, []);

  // ✅ รายการที่ต้องแสดงเสมอ ถึงแม้ไม่มีข้อมูลใน DB/API
  const DEFAULT_CHARGERS = [
    { id: -101, name: "Solar" },
    { id: -102, name: "Grid" },
    // ถ้าคุณมีชื่อแบบ Solar+Grid ด้วย ให้เปิดบรรทัดนี้ได้
    // { id: -103, name: "Solar + Grid" },
  ];

  // ✅ รวมยอด EV ตามสถานี (คิด RemainingPower ด้วย) + Solar/Grid ต้องขึ้นเสมอแม้ 0
  // ✅ FIX: กัน Solar/Grid ซ้ำ โดย merge ด้วย "ชื่อ" ไม่ใช่ id
  const evSummary = (() => {
    // 1) base: ใส่ Solar/Grid ไว้ก่อนเสมอ (ยอด = 0)
    const baseByKey = DEFAULT_CHARGERS.reduce((acc, item) => {
      acc[`name:${item.name}`] = { id: item.id, name: item.name, total: 0 };
      return acc;
    }, {} as Record<string, { id: number; name: string; total: number }>);

    // 2) merge ข้อมูลจริงจาก evPayments
    const merged = evPayments.reduce((acc, cur: any) => {
      const realId = cur?.EVcharging?.ID;
      if (!realId) return acc;

      const realName = cur?.EVcharging?.Name ?? "";
      const usedBaht = calcUsedBahtWithRemain(cur);

      // ✅ ถ้าเป็น Solar/Grid → รวมเข้ากับ default เดิม (ไม่สร้างซ้ำ)
      if (realName === "Solar" || realName === "Grid" || realName === "Solar + Grid") {
        const key = `name:${realName}`;

        if (!acc[key]) {
          // เผื่อกรณีชื่อ "Solar + Grid" ไม่ได้ใส่ใน DEFAULT_CHARGERS
          acc[key] = { id: realId, name: realName, total: 0 };
        }

        acc[key].total += usedBaht;
        return acc;
      }

      // ✅ รายการอื่น ๆ → ใช้ id เป็น key ปกติ
      const key = `id:${realId}`;
      const name =
        realName && realName.trim().length > 0 ? realName : `Charger ${realId}`;

      if (!acc[key]) acc[key] = { id: realId, name, total: 0 };
      acc[key].total += usedBaht;

      return acc;
    }, baseByKey);

    // 3) คืนค่าเป็น array และจัดลำดับให้ Solar/Grid ขึ้นก่อน
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

  const earningData = [
    {
      title: "Customers",
      icon: <FaUsers />,
      value: userCount,
    },
    {
      title: "Employees",
      icon: <MdOutlineSupervisorAccount />,
      value: employeeCount,
    },
    ...evSummary.map((ev) => {
      const safeTotal = Number(ev?.total) || 0;

      return {
        title: ev.name,
        icon: <FaChargingStation />,
        value: `฿ ${safeTotal.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      };
    }),
  ];

  const handleDownloadCSV = async () => {
    const res = await ListPayments();
    if (!res) return;
    const headers = ["ID", "User", "Method", "Amount (BATH)", "Date"];
    const rows = res.map((r) => [
      r.ID,
      r.User?.FirstName ?? "",
      r.Method?.Medthod ?? "",
      r.Amount ?? 0,
      new Date(r.Date).toLocaleString(),
    ]);
    const csv = [headers.join(","), ...rows.map((x) => x.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payments.csv";
    a.click();
  };

  return (
    <div className="w-full px-4 pt-4 pb-1 flex flex-col gap-3">
      {/* ===== Card แรก (พื้นหลังเป็นรูป) ===== */}
      <div
        className="relative rounded-2xl p-5 shadow-sm overflow-hidden h-40"
        style={{
          backgroundImage: `url(${cardBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-blue-600/25" />
        <div className="relative z-10 flex flex-col justify-between h-full">
          <div>
            <p className="text-white/90 text-sm">Total Payment</p>
            <h1 className="text-3xl font-semibold text-white mt-1">
              ฿{" "}
              {totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}{" "}
              <span className="text-xs text-blue-100">BATH</span>
            </h1>
          </div>
          <div className="flex justify-end">
            <Button
              text="Download CSV"
              color="white"
              bgColor={currentColor || brandBlue}
              borderRadius="12px"
              onClick={handleDownloadCSV}
            />
          </div>
        </div>
      </div>

      {/* ===== Card อื่น ๆ (พื้นหลังขาว) ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {earningData.map((item, idx) => (
          <div
            key={idx}
            className="rounded-2xl p-4 shadow-sm text-center h-32 bg-white border border-blue-100"
          >
            <div className="text-3xl text-blue-700 mb-2">{item.icon}</div>
            <p className="text-lg font-semibold text-gray-800">{item.value}</p>
            <p className="text-[12px] text-blue-600 mt-1">{item.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhoneDashboard;
