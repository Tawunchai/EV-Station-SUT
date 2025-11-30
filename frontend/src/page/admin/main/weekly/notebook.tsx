import { useEffect, useMemo, useState } from "react";
import { Modal, Table, Button, Popconfirm, Tooltip, message } from "antd";
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { IoIosMore } from "react-icons/io";
import { FiShoppingCart, FiStar } from "react-icons/fi";
import { BsChatLeft } from "react-icons/bs";

import { SparkLine } from "../../../../component/admin";
import { SparklineAreaData } from "../../../../assets/admin/dummy";
import { useStateContext } from "../../../../contexts/ContextProvider";
import {
  ListPayments,
  ListEVChargingPayments,
  ListReviews,
  UpdateReviewStatusByID,
  DeleteReviewByID,
} from "../../../../services";

const Index = () => {
  const { currentColor } = useStateContext();

  const [topPayer, setTopPayer] = useState<any>(null);
  const [mostEV, setMostEV] = useState<any>(null);
  const [totalReviews, setTotalReviews] = useState<number>(0);

  const [reviewList, setReviewList] = useState<any[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);

  const [toggleLoading, setToggleLoading] = useState<
    Record<string | number, boolean>
  >({});
  const [deleteLoading, setDeleteLoading] = useState<
    Record<string | number, boolean>
  >({});

  // ✅ เก็บสถานะว่าคอมเมนต์ของรีวิวไหนกำลัง "ขยาย" อยู่
  const [expandedComments, setExpandedComments] = useState<
    Record<string | number, boolean>
  >({});

  useEffect(() => {
    const fetchData = async () => {
      const payments = await ListPayments();
      const evPayments = await ListEVChargingPayments();
      const reviews = await ListReviews();

      // ===== Top Payer =====
      const userTotals: Record<string, number> = {};
      payments?.forEach((p: any) => {
        const name = `${p?.User?.FirstName ?? ""} ${
          p?.User?.LastName ?? ""
        }`.trim() || "Unknown";
        const amount = Number(p?.Amount ?? 0);
        userTotals[name] = (userTotals[name] || 0) + amount;
      });
      const topUser = Object.entries(userTotals).sort(
        (a, b) => b[1] - a[1]
      )[0];
      setTopPayer({ name: topUser?.[0], amount: topUser?.[1] ?? 0 });

      // ===== Top EV Charger (by income) =====
      const evTotals: Record<string, number> = {};
      const evIncome: Record<string, number> = {};
      evPayments?.forEach((ev: any) => {
        const name = ev?.EVcharging?.Name ?? "Unknown EV";
        evTotals[name] = (evTotals[name] || 0) + 1;
        const income = Number(ev?.Price ?? 0);
        evIncome[name] = (evIncome[name] || 0) + income;
      });
      const topEV = Object.entries(evIncome).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];
      setMostEV({
        name: topEV,
        count: evTotals[topEV] ?? 0,
        income: evIncome[topEV] ?? 0,
      });

      // ===== Reviews =====
      setTotalReviews(reviews?.length ?? 0);
      setReviewList(reviews ?? []);
    };

    fetchData();
  }, []);

  const handleToggleVisibility = async (record: any) => {
    const id = record?.ID ?? record?.id;
    if (!id) return;
    const nextStatus = !record?.Status;

    try {
      setToggleLoading((s) => ({ ...s, [id]: true }));
      const res = await UpdateReviewStatusByID(id, nextStatus);
      if (!res) throw new Error("Update failed");

      setReviewList((list) =>
        list.map((r) =>
          (r.ID ?? r.id) === id ? { ...r, Status: nextStatus } : r
        )
      );
      message.success(
        nextStatus ? "เปิดการมองเห็นรีวิวแล้ว" : "ปิดการมองเห็นรีวิวแล้ว"
      );
    } catch {
      message.error("ไม่สามารถอัปเดตสถานะได้");
    } finally {
      setToggleLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const handleDeleteReview = async (record: any) => {
    const id = record?.ID ?? record?.id;
    if (!id) return;

    try {
      setDeleteLoading((s) => ({ ...s, [id]: true }));
      const ok = await DeleteReviewByID(id);
      if (!ok) throw new Error("Delete failed");

      setReviewList((list) =>
        list.filter((r) => (r.ID ?? r.id) !== id)
      );
      setTotalReviews((n) => Math.max(0, n - 1));
      message.success("ลบรีวิวสำเร็จ");
    } catch {
      message.error("ไม่สามารถลบรีวิวได้");
    } finally {
      setDeleteLoading((s) => ({ ...s, [id]: false }));
    }
  };

  const reviewColumns = useMemo(
    () => [
      {
        title: "#",
        dataIndex: "index",
        key: "index",
        width: 60,
        render: (_: any, __: any, index: number) => index + 1,
      },
      {
        title: "User",
        key: "user",
        render: (_: any, record: any) => {
          const name = `${record?.User?.FirstName ?? ""} ${
            record?.User?.LastName ?? ""
          }`.trim();
          const email = record?.User?.Email ?? "";
          return (
            <div className="flex flex-col">
              <span className="font-semibold text-gray-800">
                {name || email || "Unknown"}
              </span>
              {email && (
                <span className="text-[11px] text-gray-400">{email}</span>
              )}
            </div>
          );
        },
      },
      {
        title: "Rating",
        dataIndex: "Rating",
        key: "rating",
        width: 120,
        render: (val: any) => {
          if (!val && val !== 0) return "-";
          const rating = Number(val) || 0;
          const stars = Array.from({ length: 5 }, (_, i) => i < rating);
          return (
            <div className="flex items-center gap-1">
              {stars.map((active, idx) => (
                <FiStar
                  key={idx}
                  className={
                    active ? "text-yellow-400" : "text-gray-300"
                  }
                  size={16}
                />
              ))}
              <span className="ml-1 text-xs text-gray-500">
                {rating.toFixed(1)}
              </span>
            </div>
          );
        },
      },
      {
        title: "Comment",
        dataIndex: "Comment",
        key: "comment",
        width: 420, // ✅ ขยายความกว้างของคอลัมน์ comment
        ellipsis: false,
        render: (_: any, record: any, index: number) => {
          const fullText: string = record?.Comment ?? "";
          if (!fullText) return "-";

          const id = record?.ID ?? record?.id ?? index;
          const isExpanded = !!expandedComments[id];

          // จำนวนตัวอักษรที่จะแสดงตอน "Show less"
          const MAX_LEN = 100;
          const isLong = fullText.length > MAX_LEN;
          const displayText =
            isExpanded || !isLong
              ? fullText
              : `${fullText.slice(0, MAX_LEN)}...`;

          const toggle = () =>
            setExpandedComments((prev) => ({
              ...prev,
              [id]: !prev[id],
            }));

          return (
            <div
              className="text-gray-700 text-sm"
              style={{ maxWidth: 520 }} // ✅ ให้กล่องข้อความกว้างขึ้น
            >
              <span className="whitespace-pre-wrap break-words">
                {displayText}
              </span>
              {isLong && (
                <button
                  type="button"
                  onClick={toggle}
                  className="ml-2 text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          );
        },
      },
      {
        title: "Date",
        dataIndex: "CreatedAt",
        key: "date",
        width: 200,
        render: (val: any) =>
          val
            ? new Date(val).toLocaleString("th-TH", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-",
      },
      {
        title: "จัดการ",
        key: "actions",
        width: 260,
        render: (_: any, record: any) => {
          const id = record?.ID ?? record?.id;
          const isVisible = !!record?.Status;
          const btnStyle = isVisible
            ? {
                backgroundColor: "#dbeafe",
                color: "#1e3a8a",
                borderColor: "#bfdbfe",
              }
            : {
                backgroundColor: "#e2e8f0",
                color: "#334155",
                borderColor: "#cbd5e1",
              };

          return (
            <div className="flex items-center gap-2">
              <Tooltip title={isVisible ? "เปิดการมองเห็น" : "ปิดการมองเห็น"}>
                <Button
                  icon={isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  onClick={() => handleToggleVisibility(record)}
                  loading={!!toggleLoading[id]}
                  style={btnStyle}
                >
                  {isVisible ? "เปิด" : "ปิด"}
                </Button>
              </Tooltip>

              <Popconfirm
                title="ลบรีวิวนี้?"
                description="ยืนยันการลบรีวิวนี้ จะไม่สามารถกู้คืนได้"
                okText="ลบ"
                cancelText="ยกเลิก"
                onConfirm={() => handleDeleteReview(record)}
              >
                <Tooltip title="ลบ">
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={!!deleteLoading[id]}
                  >
                    ลบ
                  </Button>
                </Tooltip>
              </Popconfirm>
            </div>
          );
        },
      },
    ],
    [toggleLoading, deleteLoading, expandedComments]
  );

  const stats = [
    {
      icon: <FiShoppingCart />,
      amount: `฿${topPayer?.amount?.toLocaleString() ?? "-"}`,
      title: "Top Payer",
      desc: topPayer?.name ?? "-",
      iconBg: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      textColor: "text-blue-700",
    },
    {
      icon: <FiStar />,
      amount: `฿${mostEV?.income?.toLocaleString() ?? "-"}`,
      title: "Top EV Charger",
      desc: `${mostEV?.name ?? "-"} (${mostEV?.count ?? 0} transections)`,
      iconBg: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
      textColor: "text-blue-700",
    },
    {
      icon: <BsChatLeft />,
      amount: `${totalReviews} Reviews`,
      title: "Total Reviews",
      desc: "Across all users",
      iconBg: "linear-gradient(135deg, #60a5fa, #2563eb)",
      textColor: "text-blue-700",
      clickable: true,
    },
  ];

  const handleClickAmount = (item: any) => {
    if (item?.clickable && item?.title === "Total Reviews") {
      setIsReviewModalOpen(true);
    }
  };

  return (
    <>
      {/* ===== Weekly Stats Card ===== */}
      <div className="md:w-200 bg-white border border-blue-100 rounded-2xl p-6 m-3 shadow-sm">
        <div className="flex justify-between">
          <p className="text-xl font-semibold text-blue-800">
            Weekly Stats
          </p>
          <button
            type="button"
            className="text-xl font-semibold text-blue-500 hover:text-blue-700"
          >
            <IoIosMore />
          </button>
        </div>

        <div className="mt-8">
          {stats.map((item, index) => (
            <div
              key={index}
              className="flex justify-between items-center mt-4 w-full"
            >
              <div className="flex gap-4 items-center">
                <div
                  className="text-2xl text-white rounded-full p-3 shadow-md"
                  style={{ background: item.iconBg }}
                >
                  {item.icon}
                </div>
                <div>
                  <p className="text-md font-semibold text-gray-800">
                    {item.title}
                  </p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              </div>
              <p
                className={`cursor-pointer ${item.textColor} font-semibold`}
                onClick={() => handleClickAmount(item)}
                title={item.clickable ? "View all reviews" : undefined}
              >
                {item.amount}
              </p>
            </div>
          ))}

          <div className="mt-5">
            <SparkLine
              currentColor={currentColor}
              id="area-sparkLine"
              height="160px"
              type="Area"
              data={SparklineAreaData}
              width="320"
              color="rgb(219, 234, 254)"
            />
          </div>
        </div>
      </div>

      {/* ===== EV-STYLE REVIEW MODAL ===== */}
      <Modal
        open={isReviewModalOpen}
        onCancel={() => setIsReviewModalOpen(false)}
        footer={null}
        centered
        width={1100}
        title={null}
        closable={false}
        bodyStyle={{ padding: 0, background: "transparent" }}
        // @ts-ignore (Antd v5)
        styles={{
          content: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
        destroyOnClose
      >
        {/* การ์ดหลักแบบ EV Theme */}
        <div className="w-full max-w-5xl mx-auto rounded-[26px] bg-white shadow-xl overflow-hidden">
          {/* HEADER GRADIENT */}
          <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-5 sm:px-8 py-4 flex items-center gap-4 text-white">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
              <BsChatLeft className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm sm:text-base font-semibold truncate">
                User Reviews
              </div>
              <div className="text-[11px] text-blue-100 truncate">
                รีวิวจากผู้ใช้งาน EV Station ของคุณ
              </div>
            </div>

            {/* จำนวนรีวิว + ปุ่มปิด */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-[11px] text-blue-100 leading-tight text-right">
                <span>All reviews</span>
                <span className="font-semibold text-white">
                  {totalReviews} รายการ
                </span>
              </div>

              <button
                onClick={() => setIsReviewModalOpen(false)}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M6 6l12 12M6 18L18 6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* SUB HEADER / SUMMARY */}
          <div className="px-5 sm:px-8 py-3 border-b border-gray-200 bg-white">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">
              REVIEWS SUMMARY
            </div>
            <div className="mt-1 text-sm sm:text-base font-semibold text-gray-900">
              รายละเอียดรีวิวทั้งหมดจากผู้ใช้ที่เคยชาร์จ EV
            </div>
          </div>

          {/* CONTENT: TABLE ZONE */}
          <div className="px-5 sm:px-8 pt-3 pb-5 bg-white">
            <div className="text-[11px] text-gray-500 mb-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                ใช้ปุ่ม <span className="font-semibold">เปิด/ปิด</span>{" "}
                เพื่อควบคุมการแสดงรีวิวบนหน้าเว็บของผู้ใช้
              </span>
              <span className="text-blue-600 font-semibold">
                ทั้งหมด {totalReviews} รีวิว
              </span>
            </div>

            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              {/* TABLE HEADER STRIP */}
              <div className="bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-500 flex items-center justify-between">
                <span>รายการรีวิวทั้งหมด</span>
                <span className="tabular-nums">
                  {totalReviews} items
                </span>
              </div>

              {/* TABLE SCROLL AREA */}
              <div className="max-h-[440px] overflow-auto">
                <Table
                  rowKey={(r: any, idx) => r?.ID ?? r?.id ?? idx}
                  dataSource={reviewList}
                  columns={reviewColumns as any}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total, range) =>
                      `${range[0]}-${range[1]} จาก ${total} รายการ`,
                  }}
                  scroll={{ x: 900 }} // ✅ ขยายค่า scroll x ให้เหมาะกับคอลัมน์ที่กว้างขึ้น
                  size="middle"
                  bordered={false}
                  className="ev-review-table"
                  rowClassName={(_, index) =>
                    index % 2 === 0
                      ? "bg-white hover:bg-blue-50/70 transition-colors"
                      : "bg-slate-50 hover:bg-blue-50/70 transition-colors"
                  }
                />
              </div>
            </div>

            <div className="pt-3 text-[11px] text-center text-gray-400">
              ขอบคุณสำหรับทุกความคิดเห็น ช่วยให้ EV Station ของเราดีขึ้น
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Index;
