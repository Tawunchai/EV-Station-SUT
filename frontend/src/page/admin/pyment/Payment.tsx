import { useEffect, useState, useMemo } from "react";
import LineChart from "./chart/EVRevenueChartIndex";
import { Modal, Input, Button, message, Skeleton } from "antd";
import { ListPayments, ListBank, UpdateBank } from "../../../services";
import { PaymentsInterface } from "../../../interface/IPayment";
import { BankInterface } from "../../../interface/IBank";
import {
  BanknotesIcon,
  UserIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import PaymentHistoryTable from "./payment/index";
import PaymentCoinsTable from "./coin/index";
import { GetProfile } from "../../../services/httpLogin";
import { FaTimes } from "react-icons/fa";

/* ===========================
   BANK CODE MAP
   =========================== */
const TH_BANK_CODE_MAP: Record<string, string> = {
  "002": "ธนาคารกรุงเทพ จำกัด (มหาชน)",
  "004": "ธนาคารกสิกรไทย จำกัด (มหาชน)",
  "006": "ธนาคารกรุงไทย จำกัด (มหาชน)",
  "008": "ธนาคารเจพีมอร์แกน เชส",
  "011": "ธนาคารทหารไทยธนชาต จำกัด (มหาชน)",
  "014": "ธนาคารไทยพาณิชย์ จำกัด (มหาชน)",
  "017": "ธนาคารซิตี้แบงก์",
  "018": "ธนาคารซูมิโตโม มิตซุย แบงกิ้ง คอร์ปอเรชั่น",
  "020": "ธนาคารสแตนดาร์ดชาร์เตอร์ด (ไทย) จำกัด (มหาชน)",
  "022": "ธนาคารซีไอเอ็มบี ไทย จำกัด (มหาชน)",
  "024": "ธนาคารยูโอบี จำกัด (มหาชน)",
  "025": "ธนาคารกรุงศรีอยุธยา จำกัด (มหาชน)",
  "026": "ธนาคารเมกะ สากลพาณิชย์ จำกัด (มหาชน)",
  "027": "ธนาคารแห่งอเมริกา เนชั่นแนล แอสโซซิเอชั่น",
  "030": "ธนาคารออมสิน",
  "031": "ธนาคารฮ่องกงและเซี่ยงไฮ้แบงกิ้งคอร์ปอเรชั่น จำกัด",
  "032": "ธนาคารดอยซ์แบงก์",
  "033": "ธนาคารอาคารสงเคราะห์",
  "034": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
  "039": "ธนาคารมิซูโฮ จํากัด",
  "045": "ธนาคารบีเอ็นพี พารีบาส์",
  "052": "ธนาคารแห่งประเทศจีน (ไทย) จำกัด (มหาชน)",
  "066": "ธนาคารอิสลามแห่งประเทศไทย",
  "067": "ธนาคารทิสโก้ จำกัด (มหาชน)",
  "069": "ธนาคารเกียรตินาคินภัทร จำกัด (มหาชน)",
  "070": "ธนาคารไอซีบีซี (ไทย) จำกัด (มหาชน)",
  "071": "ธนาคารไทยเครดิต จำกัด (มหาชน)",
  "073": "ธนาคารแลนด์ แอนด์ เฮ้าส์ จำกัด (มหาชน)",
};

// ฟังก์ชันแสดงชื่อธนาคาร
const formatBankingDisplay = (banking: string | undefined | null): string => {
  if (!banking) return "-";
  const trimmed = String(banking).trim();
  return TH_BANK_CODE_MAP[trimmed] || trimmed;
};

const Payment = () => {
  const [userRole, setUserRole] = useState<string | null>(null); // ⭐ ส่ง role ต่อ
  const [paymentData, setPaymentData] = useState<PaymentsInterface[]>([]);
  const [bankData, setBankData] = useState<BankInterface[]>([]);
  const [editBank, setEditBank] = useState<BankInterface | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);

  // ⭐ โหลด role ของผู้ใช้จาก token
  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await GetProfile();
        setUserRole(res.data.role || null);
      } catch {
        setUserRole(null);
      }
    };
    loadRole();
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchBanks();
  }, []);

  const fetchPayments = async () => {
    setTableLoading(true);
    const data = await ListPayments();
    setTimeout(() => {
      setPaymentData(data || []);
      setTableLoading(false);
    }, 2000);
  };

  const fetchBanks = async () => {
    const banks = await ListBank();
    if (banks) setBankData(banks);
  };

  const handleBankChange = (field: keyof BankInterface, value: string) => {
    if (!editBank) return;
    if (field === "Minimum") {
      setEditBank({ ...editBank, Minimum: Number(value) });
    } else {
      setEditBank({ ...editBank, [field]: value as any });
    }
  };

  const handleBankUpdate = async () => {
    if (!editBank) return;
    setLoading(true);

    const ok = await UpdateBank(editBank.ID, {
      promptpay: editBank.PromptPay,
      manager: editBank.Manager,
      banking: editBank.Banking,
      minimum: editBank.Minimum,
    });

    setLoading(false);

    if (ok) {
      message.success("อัปเดตข้อมูลธนาคารเรียบร้อยแล้ว");
      setEditBank(null);
      fetchBanks();
    } else {
      message.error("อัปเดตข้อมูลธนาคารล้มเหลว");
    }
  };

  const selectedBankCode = useMemo(() => {
    if (!editBank?.Banking) return "";
    const val = String(editBank.Banking).trim();
    return TH_BANK_CODE_MAP[val] ? val : "";
  }, [editBank?.Banking]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-blue-50 via-white to-white mt-14 sm:mt-0">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="mx-auto max-w-screen-xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">
            Payment & Banking
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 sm:px-6 py-6 space-y-6">

        {/* Bank Info */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/60">
            <h2 className="text-[15px] sm:text-base font-semibold text-gray-800">
              ข้อมูลธนาคารปัจจุบัน
            </h2>
          </div>

          {bankData.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-500">
              ไม่มีข้อมูลธนาคาร
            </div>
          ) : (
            <div className="px-3 sm:px-6 py-4">
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full text-gray-700 ev-table">
                  <thead>
                    <tr>
                      <th>PROMPTPAY</th>
                      <th>MANAGER</th>
                      <th>BANKING</th>
                      <th>MINIMUM</th>
                      {userRole === "Admin" && (
                        <th className="text-center">จัดการ</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bankData.map((bank) => (
                      <tr key={bank.ID}>
                        <td>{bank.PromptPay}</td>
                        <td>{bank.Manager}</td>
                        <td>{formatBankingDisplay(bank.Banking)}</td>
                        <td>{bank.Minimum} บาท</td>

                        {/* Admin เท่านั้นที่เห็นปุ่มแก้ไข */}
                        {userRole === "Admin" && (
                          <td className="text-center">
                            <Button
                              type="primary"
                              className="bg-blue-600 hover:bg-blue-700 border-blue-600 rounded-lg"
                              onClick={() => setEditBank(bank)}
                            >
                              แก้ไข
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Chart */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-6">
          <LineChart />
        </section>

        {/* Payment History */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-6">
          {tableLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <PaymentHistoryTable data={paymentData} role={userRole} />
          )}
        </section>

        {/* Payment Coins */}
        <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-6">
          {tableLoading ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <PaymentCoinsTable role={userRole} />
          )}
        </section>

      </main>

      {/* Edit Bank Modal */}
      {/* Edit Bank Modal */}
      <Modal
        open={!!editBank}
        onCancel={() => setEditBank(null)}
        footer={null}
        centered
        destroyOnClose
        width={440}
        closeIcon={null}
        styles={{
          content: {
            borderRadius: 24,
            padding: 0,
            overflow: "hidden",
            background: "#ffffff",
          },
        }}
      >
        {editBank && userRole === "Admin" && (
          <div className="ev-scope flex flex-col">
            {/* Header */}
            <div className="px-5 pt-3 pb-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BanknotesIcon className="h-6 w-6 text-white" />
                <h2 className="text-base sm:text-lg font-semibold">
                  Edit bank details
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditBank(null)}
                className="p-2 -m-2 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Close dialog"
              >
                <FaTimes className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 bg-blue-50/40 text-gray-800">
              <div className="space-y-4">
                {/* PromptPay */}
                <label className="block">
                  <span className="text-sm text-gray-700 font-medium flex items-center mb-1">
                    <BanknotesIcon className="h-5 w-5 mr-2 text-blue-500" />
                    PromptPay
                  </span>
                  <Input
                    value={editBank.PromptPay}
                    onChange={(e) => handleBankChange("PromptPay", e.target.value)}
                    className="rounded-xl h-10 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-300"
                  />
                </label>

                {/* Manager */}
                <label className="block">
                  <span className="text-sm text-gray-700 font-medium flex items-center mb-1">
                    <UserIcon className="h-5 w-5 mr-2 text-blue-500" />
                    Account manager
                  </span>
                  <Input
                    value={editBank.Manager}
                    onChange={(e) => handleBankChange("Manager", e.target.value)}
                    className="rounded-xl h-10 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-300"
                  />
                </label>

                {/* Bank */}
                <label className="block">
                  <span className="text-sm text-gray-700 font-medium flex items-center mb-1">
                    <CreditCardIcon className="h-5 w-5 mr-2 text-blue-500" />
                    Bank
                  </span>
                  <div className="relative">
                    <select
                      value={selectedBankCode}
                      onChange={(e) => handleBankChange("Banking", e.target.value)}
                      className="appearance-none w-full rounded-xl border border-slate-200 h-10 px-3 pr-8 bg-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-300"
                    >
                      <option value="">Select bank</option>
                      {Object.entries(TH_BANK_CODE_MAP).map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs">
                      ▼
                    </span>
                  </div>
                </label>

                {/* Minimum */}
                <label className="block">
                  <span className="text-sm text-gray-700 font-medium flex items-center mb-1">
                    <CreditCardIcon className="h-5 w-5 mr-2 text-blue-500" />
                    Minimum amount (THB)
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={editBank.Minimum}
                    onChange={(e) => handleBankChange("Minimum", e.target.value)}
                    className="rounded-xl h-10 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-300"
                  />
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 bg-white border-t border-slate-100 flex gap-2 justify-end">
              <Button
                onClick={() => setEditBank(null)}
                className="px-4 h-10 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="primary"
                loading={loading}
                onClick={handleBankUpdate}
                className="px-4 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Table Style */}
      <style>{`
        .ev-table thead th {
          background: #f9fafb;
          color: #374151;
          border-bottom: 1px solid #e5e7eb;
          font-weight: 700;
          font-size: 13px;
          text-align: left;
          padding: 12px 10px;
        }
        .ev-table tbody td {
          border-top: 1px solid #f1f5f9;
          padding: 12px 10px;
        }
        .ev-table tbody tr:nth-child(even) td {
          background: #f9fafb;
        }
        .ev-table tbody tr:hover td {
          background: #f3f4f6;
        }
      `}</style>
    </div>
  );
};

export default Payment;
