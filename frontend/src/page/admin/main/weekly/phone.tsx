import { useEffect, useState } from "react";
import { Modal, Button, Popconfirm, message } from "antd";
import { IoIosMore } from "react-icons/io";
import { FiShoppingCart, FiStar } from "react-icons/fi";
import { BsChatLeft } from "react-icons/bs";
import {
  EyeOutlined,
  EyeInvisibleOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
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

const PhoneWeeklyStats: React.FC = () => {
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

  // เก็บสถานะ comment ที่ถูกขยาย (show more)
  const [expandedComments, setExpandedComments] = useState<
    Record<string | number, boolean>
  >({});

  useEffect(() => {
    const fetchData = async () => {
      const payments = await ListPayments();
      const evPayments = await ListEVChargingPayments();
      const reviews = await ListReviews();

      // ✅ 1. Top Payer
      const userTotals: Record<string, number> = {};
      payments?.forEach((p: any) => {
        const name =
          `${p.User?.FirstName ?? ""} ${p.User?.LastName ?? ""}`.trim() ||
          "Unknown";
        const amount = Number(p.Amount ?? 0);
        userTotals[name] = (userTotals[name] || 0) + amount;
      });
      const topUser = Object.entries(userTotals).sort(
        (a, b) => b[1] - a[1]
      )[0];
      setTopPayer({ name: topUser?.[0], amount: topUser?.[1] ?? 0 });

      // ✅ 2. Top EV Charger Revenue
      const evTotals: Record<string, number> = {};
      const evIncome: Record<string, number> = {};
      evPayments?.forEach((ev: any) => {
        const name = ev.EVcharging?.Name ?? "Unknown EV";
        const price = Number(ev.Price ?? 0);
        evTotals[name] = (evTotals[name] || 0) + 1;
        evIncome[name] = (evIncome[name] || 0) + price;
      });
      const topEV = Object.entries(evIncome).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];
      setMostEV({
        name: topEV,
        count: evTotals[topEV] ?? 0,
        income: evIncome[topEV] ?? 0,
      });

      // ✅ 3. Total Reviews
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

  const stats = [
    {
      icon: <FiShoppingCart />,
      amount:
        topPayer?.amount != null
          ? `฿${Number(topPayer.amount).toLocaleString()}`
          : "-",
      title: "Top Payer",
      desc: topPayer?.name ?? "-",
      iconBg: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      textColor: "text-blue-700",
    },
    {
      icon: <FiStar />,
      amount:
        mostEV?.income != null
          ? `฿${Number(mostEV.income).toLocaleString()}`
          : "-",
      title: "Top EV Charger",
      desc: `${mostEV?.name ?? "-"} (${mostEV?.count ?? 0} uses)`,
      iconBg: "linear-gradient(135deg, #60a5fa, #2563eb)",
      textColor: "text-blue-700",
    },
    {
      icon: <BsChatLeft />,
      amount: `${totalReviews} Reviews`,
      title: "Total Reviews",
      desc: "Across all users",
      iconBg: "linear-gradient(135deg, #93c5fd, #1d4ed8)",
      textColor: "text-blue-700",
      clickable: true,
    },
  ];

  const handleClickStat = (item: any) => {
    if (item?.clickable && item.title === "Total Reviews") {
      setIsReviewModalOpen(true);
    }
  };

  return (
    <>
      {/* ===== Weekly Stats (Mobile Card) ===== */}
      <div className="max-w-[360px] w-full mx-auto bg-white rounded-2xl shadow-md border border-blue-100 p-4 mt-2 mb-4 px-3">
        {/* Header */}
        <div className="flex justify-between items-center px-1">
          <p className="text-base font-semibold text-blue-800">
            Total Overview
          </p>
          <button
            type="button"
            className="flex items-center justify-center h-8 w-8 rounded-full text-lg font-semibold text-blue-500 hover:text-blue-700 active:scale-95 transition-all"
          >
            <IoIosMore />
          </button>
        </div>

        {/* Stats List */}
        <div className="mt-4 flex flex-col gap-3">
          {stats.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleClickStat(item)}
              className="w-full flex justify-between items-center bg-gradient-to-r from-blue-50 to-white rounded-xl px-3 py-2 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
            >
              <div className="flex gap-3 items-center min-w-0">
                <div
                  className="flex items-center justify-center text-white text-xl p-2.5 rounded-full shadow-md flex-shrink-0"
                  style={{ background: item.iconBg }}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {item.desc}
                  </p>
                </div>
              </div>
              <p
                className={`ml-2 text-right text-xs sm:text-sm font-bold ${item.textColor} whitespace-nowrap`}
              >
                {item.amount}
              </p>
            </button>
          ))}
        </div>

        {/* Sparkline Chart */}
        <div className="mt-4 mb-1 flex justify-center">
          <SparkLine
            currentColor={currentColor}
            id="phone-area-sparkLine"
            height="110px"
            type="Area"
            data={SparklineAreaData}
            width="260"
            color="rgb(219, 234, 254)"
          />
        </div>
      </div>

      {/* ===== MOBILE REVIEW MODAL ===== */}
      <Modal
        open={isReviewModalOpen}
        onCancel={() => setIsReviewModalOpen(false)}
        footer={null}
        centered
        width="100%"
        title={null}
        closable={false}
        bodyStyle={{ padding: 0, background: "transparent" }}
        // @ts-ignore
        styles={{
          content: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
        destroyOnClose
      >
        {/* กล่องหลักแบบเต็มจอมือถือ */}
        <div className="w-full max-w-sm mx-auto rounded-3xl bg-white shadow-xl overflow-hidden">
          {/* Header Gradient */}
          <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-3 flex items-center gap-3 text-white">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15">
              <BsChatLeft className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                User Reviews
              </div>
              <div className="text-[10px] text-blue-100 truncate">
                รีวิวจากผู้ใช้งาน EV Station ของคุณ
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-blue-100">
                ทั้งหมด{" "}
                <span className="font-semibold text-white">
                  {totalReviews}
                </span>{" "}
                รีวิว
              </span>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
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

          {/* Body: card list, scrollable */}
          <div className="px-4 pt-3 pb-4 bg-white max-h-[70vh] overflow-y-auto">
            {reviewList.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                ยังไม่มีรีวิวจากผู้ใช้งาน
              </div>
            ) : (
              <div className="space-y-3">
                {reviewList.map((record: any, idx: number) => {
                  const id = record?.ID ?? record?.id ?? idx;
                  const name = `${record?.User?.FirstName ?? ""} ${
                    record?.User?.LastName ?? ""
                  }`.trim();
                  const email = record?.User?.Email ?? "";
                  const rating = Number(record?.Rating ?? 0);

                  const fullText: string = record?.Comment ?? "";
                  const isExpanded = !!expandedComments[id];
                  const MAX_LEN = 110;
                  const isLong = fullText.length > MAX_LEN;
                  const displayText =
                    isExpanded || !isLong
                      ? fullText
                      : `${fullText.slice(0, MAX_LEN)}...`;

                  const toggleComment = () =>
                    setExpandedComments((prev) => ({
                      ...prev,
                      [id]: !prev[id],
                    }));

                  const createdAt = record?.CreatedAt
                    ? new Date(record.CreatedAt)
                    : null;

                  const dateText = createdAt
                    ? createdAt.toLocaleDateString("th-TH", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })
                    : "-";

                  const timeText = createdAt
                    ? createdAt.toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "";

                  const isVisible = !!record?.Status;

                  const starArr = Array.from({ length: 5 }, (_, i) => i < rating);

                  return (
                    <div
                      key={id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      {/* Top line: index + date */}
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                        <span className="font-semibold text-gray-500">
                          #{idx + 1}
                        </span>
                        <span>
                          {dateText} {timeText && `• ${timeText}`}
                        </span>
                      </div>

                      {/* User + rating */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {name || email || "Unknown"}
                          </p>
                          {email && (
                            <p className="text-[11px] text-gray-500 truncate">
                              {email}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-0.5">
                            {starArr.map((active, sIdx) => (
                              <FiStar
                                key={sIdx}
                                className={
                                  active
                                    ? "text-yellow-400"
                                    : "text-gray-300"
                                }
                                size={14}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-gray-500">
                            {rating.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Comment */}
                      <div className="mt-2 text-xs text-gray-700">
                        <span className="whitespace-pre-wrap break-words">
                          {displayText || "-"}
                        </span>
                        {isLong && (
                          <button
                            type="button"
                            onClick={toggleComment}
                            className="ml-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Button
                          size="small"
                          icon={
                            isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />
                          }
                          loading={!!toggleLoading[id]}
                          onClick={() => handleToggleVisibility(record)}
                          className={
                            isVisible
                              ? "bg-blue-50 border-blue-200 text-blue-700 hover:!bg-blue-100"
                              : "bg-slate-100 border-slate-200 text-slate-700 hover:!bg-slate-200"
                          }
                        >
                          {isVisible ? "เปิด" : "ปิด"}
                        </Button>

                        <Popconfirm
                          title="ลบรีวิวนี้?"
                          description="ยืนยันการลบรีวิวนี้ จะไม่สามารถกู้คืนได้"
                          okText="ลบ"
                          cancelText="ยกเลิก"
                          onConfirm={() => handleDeleteReview(record)}
                        >
                          <Button
                            size="small"
                            danger
                            loading={!!deleteLoading[id]}
                            icon={<DeleteOutlined />}
                          >
                            ลบ
                          </Button>
                        </Popconfirm>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pb-3 text-[10px] text-center text-gray-400 bg-white">
            ขอบคุณสำหรับทุกความคิดเห็น ช่วยให้ EV Station ของเราดีขึ้น
          </div>
        </div>
      </Modal>
    </>
  );
};

export default PhoneWeeklyStats;