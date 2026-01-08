import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Table,
  Avatar,
  Tag,
  Space,
  Input,
  Image,
  Button,
  Tooltip,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { PaymentsInterface } from "../../../../interface/IPayment";
import { apiUrlPicture, DeletePayments } from "../../../../services";
import { Trash2 } from "react-feather";

/* ==========================
   Modal (EvModal)
========================== */
const EvModal: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-[420px] mx-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-blue-100">
          {children}
        </div>
      </div>
    </div>
  );
};

/* ==========================
   Types
========================== */
type RowType = {
  key: number;
  Index: number;
  ID: number;
  CustomerName: string;
  CustomerEmail: string;
  CustomerImage: string;

  // ✅ เปลี่ยนจาก Date -> CreatedAt
  CreatedAt: string;

  Amount: number;
  Method: string;
  ReferenceNumber: string;
  Picture?: string;
  Raw: PaymentsInterface;
};

interface PaymentHistoryTableProps {
  data: PaymentsInterface[];
  role: string | null; // ⭐ รับ role
}

/* ==========================
   MAIN COMPONENT
========================== */
const PaymentHistoryTable: React.FC<PaymentHistoryTableProps> = ({
  data,
  role,
}) => {
  const [rows, setRows] = useState<RowType[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const selectedIDsRef = useRef<number[]>([]);

  // Responsive ScrollX
  const [scrollX, setScrollX] = useState(900);

  useEffect(() => {
    const updateScrollX = () => {
      if (window.innerWidth <= 1300 && window.innerWidth >= 768) setScrollX(750);
      else setScrollX(900);
    };
    updateScrollX();
    window.addEventListener("resize", updateScrollX);
    return () => window.removeEventListener("resize", updateScrollX);
  }, []);

  /* ==========================
     Map Data → Rows
     ✅ ตอนโหลดข้อมูล: ใช้ CreatedAt (fallback ได้)
  ========================== */
  useEffect(() => {
    if (data && data.length > 0) {
      const mapped: RowType[] = data.map((p, idx) => {
        const name = `${p.User?.FirstName ?? ""} ${p.User?.LastName ?? ""}`.trim();

        // ✅ รองรับหลายชื่อ field กันพลาด (CreatedAt/createdAt/Date)
        const createdAtRaw =
          (p as any).CreatedAt ?? (p as any).createdAt ?? (p as any).Date ?? p.Date;

        const createdAtISO = createdAtRaw
          ? new Date(createdAtRaw).toISOString()
          : "";

        return {
          key: p.ID!,
          Index: idx + 1,
          ID: p.ID!,
          CustomerName: name || "-",
          CustomerEmail: p.User?.Email || "-",
          CustomerImage: /^https?:\/\//i.test(p.User?.Profile || "")
            ? (p.User?.Profile as string)
            : `${apiUrlPicture}${p.User?.Profile || ""}`,

          // ✅ ใช้ CreatedAt
          CreatedAt: createdAtISO,

          Amount: Number(p.Amount ?? 0),
          Method: p.Method?.Medthod || "",
          ReferenceNumber: p.ReferenceNumber || "-",
          Picture: p.Picture,
          Raw: p,
        };
      });

      // ✅ sort ล่าสุดก่อนตาม CreatedAt
      const sorted = mapped.sort((a, b) => {
        return new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime();
      });

      setRows(sorted);
    } else {
      setRows([]);
    }
  }, [data]);

  /* ==========================
     Filter
  ========================== */
  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) =>
      [r.CustomerName, r.CustomerEmail, r.Method, r.ReferenceNumber].some((f) =>
        (f || "").toLowerCase().includes(q)
      )
    );
  }, [rows, searchText]);

  /* ==========================
     ลบข้อมูล — Admin เท่านั้น
  ========================== */
  const openDeleteModal = () => {
    if (role !== "Admin") return; // ❌ User ปกติทำไม่ได้
    if (selectedRowKeys.length === 0) return;

    selectedIDsRef.current = selectedRowKeys.map((k) => Number(k));
    setOpenConfirmModal(true);
  };

  const cancelDelete = () => {
    setOpenConfirmModal(false);
    setConfirmLoading(false);
  };

  const confirmDelete = async () => {
    if (role !== "Admin") return; // Block เชิงรันไทม์
    setConfirmLoading(true);

    const ids = selectedIDsRef.current;
    const res = await DeletePayments(ids);

    if (res) {
      setRows((prev) => prev.filter((row) => !ids.includes(row.ID)));
      setSelectedRowKeys([]);
      message.success("ลบข้อมูลการชำระเงินสำเร็จ");
    } else {
      message.error("เกิดข้อผิดพลาดในการลบ");
    }

    cancelDelete();
  };

  /* ==========================
     Render Badges
  ========================== */
  const renderMethodBadge = (method: string) => {
    if (method === "QR Payment") {
      return (
        <Tag
          color="blue"
          className="px-2 py-1 rounded-md text-white bg-blue-600 border-none"
        >
          {method}
        </Tag>
      );
    }
    if (method === "Coin Payment") {
      return (
        <Tag className="px-2 py-1 rounded-md text-blue-700 bg-blue-50 border border-blue-200">
          {method}
        </Tag>
      );
    }
    return <Tag className="px-2 py-1 rounded-md">{method || "-"}</Tag>;
  };

  /* ==========================
     Sanitize Filename
  ========================== */
  const sanitize = (s: string) =>
    s.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  };

  /* ==========================
     Export CSV (ทุกคนใช้ได้)
     ✅ เปลี่ยน Date -> CreatedAt
  ========================== */
  const handleExportCSV = async () => {
    try {
      setExportingCsv(true);
      const pick =
        selectedRowKeys.length && role === "Admin"
          ? filteredData.filter((r) => selectedRowKeys.includes(r.key))
          : filteredData;

      if (!pick.length) {
        message.info("ไม่มีข้อมูลสำหรับส่งออก");
        return;
      }

      const headers = [
        "ลำดับ",
        "ID",
        "Name",
        "Email",
        "CreatedAt",
        "Amount",
        "Method",
        "Reference",
        "HasProof",
      ];

      const rowsCsv = pick.map((r) => [
        r.Index,
        r.ID,
        r.CustomerName,
        r.CustomerEmail,
        formatDate(r.CreatedAt),
        r.Amount,
        r.Method,
        r.ReferenceNumber,
        r.Picture ? "Yes" : "No",
      ]);

      const csvContent = [
        headers.join(","),
        ...rowsCsv.map((cols) =>
          cols
            .map((v) => {
              const val = v === null || v === undefined ? "" : String(v).replace(/"/g, '""');
              return /[",\n]/.test(val) ? `"${val}"` : val;
            })
            .join(",")
        ),
      ].join("\n");

      const blob = new Blob(["\ufeff" + csvContent], {
        type: "text/csv;charset=utf-8;",
      });

      saveAs(
        blob,
        `payment_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
      );

      message.success("ส่งออก CSV สำเร็จ");
    } catch (e) {
      console.error(e);
      message.error("ส่งออก CSV ล้มเหลว");
    } finally {
      setExportingCsv(false);
    }
  };

  /* ==========================
     Download ZIP (ทุกคนใช้ได้)
  ========================== */
  const handleDownloadImagesZip = async () => {
    try {
      setExportingZip(true);

      const pick =
        selectedRowKeys.length && role === "Admin"
          ? filteredData.filter((r) => selectedRowKeys.includes(r.key))
          : filteredData;

      const withPics = pick.filter((r) => !!r.Picture);

      if (!withPics.length) {
        message.info("ไม่มีรูปหลักฐานสำหรับดาวน์โหลด");
        return;
      }

      const zip = new JSZip();
      const folder = zip.folder(`payment_proofs_${new Date().toISOString().slice(0, 10)}`)!;

      for (const r of withPics) {
        const url = `${apiUrlPicture}${r.Picture}`;
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const base = sanitize(`${r.ID}_${r.CustomerName}_${r.ReferenceNumber}`);
          const ext = blob.type.split("/")[1] || "jpg";
          folder.file(`${base}.${ext}`, blob);
        } catch (err) {
          console.warn("โหลดรูปไม่ได้:", url, err);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `payment_proofs_${Date.now()}.zip`);

      message.success("ดาวน์โหลด ZIP สำเร็จ");
    } catch (e) {
      console.error(e);
      message.error("ดาวน์โหลด ZIP ล้มเหลว");
    } finally {
      setExportingZip(false);
    }
  };

  /* ==========================
     Columns
     ✅ เปลี่ยน Date & Time ให้ใช้ CreatedAt
  ========================== */
  const columns: ColumnsType<RowType> = [
    {
      title: "#",
      width: 60,
      align: "center",
      render: (_: any, __: RowType, index: number) =>
        (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: "User",
      render: (_, record) => (
        <Space size="middle">
          <Avatar src={record.CustomerImage} />
          <div>
            <div className="font-semibold">{record.CustomerName}</div>
            <div className="text-xs text-gray-500">{record.CustomerEmail}</div>
          </div>
        </Space>
      ),
    },
    {
      title: "CreatedAt",
      dataIndex: "CreatedAt",
      width: 180,
      render: (v: string) => {
        if (!v) return "-";
        const d = new Date(v);
        if (isNaN(d.getTime())) return "-";
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
      },
    },
    {
      title: "Amount (฿)",
      dataIndex: "Amount",
      width: 130,
      render: (v: number) => (
        <span className="font-semibold text-blue-700">{Number(v || 0).toLocaleString()}</span>
      ),
    },
    {
      title: "Method",
      dataIndex: "Method",
      width: 130,
      render: (v: string) => renderMethodBadge(v),
    },
    {
      title: "Reference",
      dataIndex: "ReferenceNumber",
      width: 150,
      render: (v: string) => (
        <span className="font-mono bg-blue-50 text-blue-800 px-2 py-1 rounded border border-blue-100">
          {v}
        </span>
      ),
    },
    {
      title: "Proof",
      width: 100,
      align: "center",
      render: (_, record) =>
        record.Picture ? (
          <Image
            src={`${apiUrlPicture}${record.Picture}`}
            width={46}
            height={46}
            className="rounded-lg object-cover"
            preview
          />
        ) : (
          <span className="text-gray-400 text-sm">ไม่มี</span>
        ),
    },
  ];

  /* ==========================
     Checkbox เฉพาะ Admin
  ========================== */
  const rowSelection =
    role === "Admin"
      ? {
          selectedRowKeys,
          onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
        }
      : undefined;

  /* ==========================
     RENDER
  ========================== */
  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-blue-100 bg-white relative">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b border-blue-100 bg-blue-50/40 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] sm:text-base font-semibold text-blue-900">
          Payment History
        </h2>

        <div className="flex items-center gap-2 flex-wrap">
          <Input
            allowClear
            size="middle"
            prefix={<SearchOutlined />}
            placeholder="ค้นหา: ชื่อ/อีเมล/วิธี/เลขอ้างอิง"
            className="w-[220px]"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          {/* ปุ่มลบเฉพาะ Admin */}
          {role === "Admin" && selectedRowKeys.length > 0 && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={openDeleteModal}
              className="bg-white text-red-600 hover:bg-red-50"
            >
              ลบที่เลือก ({selectedRowKeys.length})
            </Button>
          )}

          {/* Export */}
          <Tooltip title="ส่งออกเป็น CSV">
            <Button
              icon={<FileExcelOutlined />}
              loading={exportingCsv}
              onClick={handleExportCSV}
            >
              Export CSV
            </Button>
          </Tooltip>

          <Tooltip title="ดาวน์โหลดรูปหลักฐาน (ZIP)">
            <Button
              icon={<DownloadOutlined />}
              loading={exportingZip}
              onClick={handleDownloadImagesZip}
            >
              Proofs ZIP
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Table */}
      <div className="px-2 sm:px-4 py-3">
        <Table<RowType>
          columns={columns}
          dataSource={filteredData}
          rowKey="key"
          rowSelection={rowSelection} // ⭐ ซ่อน checkbox อัตโนมัติเมื่อไม่ใช่ Admin
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            showSizeChanger: true,
            pageSizeOptions: ["5", "10", "20", "50", "100"],
            onShowSizeChange: (_, size) => {
              setCurrentPage(1);
              setPageSize(size);
            },
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
            position: ["bottomCenter"],
          }}
          scroll={{ x: scrollX }}
          size="middle"
        />
      </div>

      {/* Modal ยืนยันการลบ (เฉพาะ Admin) */}
      <EvModal open={openConfirmModal} onClose={cancelDelete}>
        <div className="p-5 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
            <Trash2 size={22} className="text-blue-600" />
          </div>

          <h3 className="text-base font-bold text-slate-900">ยืนยันการลบข้อมูล</h3>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            คุณต้องการลบรายการจำนวน{" "}
            <span className="font-semibold text-blue-700">{selectedRowKeys.length}</span>{" "}
            รายการใช่หรือไม่?
            <br />
            <span className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
          </p>

          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={confirmDelete}
              disabled={confirmLoading}
              className="min-w-[96px] h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
            >
              {confirmLoading ? "กำลังลบ..." : "ลบ"}
            </button>

            <button
              onClick={cancelDelete}
              className="min-w-[96px] h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </EvModal>
    </div>
  );
};

export default PaymentHistoryTable;
