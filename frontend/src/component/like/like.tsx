import React, { useEffect, useState } from "react";
import { onLikeButtonClick, fetchLikeStatus, onUnlikeButtonClick } from "../../services";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faThumbsUp } from "@fortawesome/free-solid-svg-icons";

interface LikeProps {
  reviewID: number;
  userID: number;
}

const Like: React.FC<LikeProps> = ({ reviewID, userID }) => {
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const status = await fetchLikeStatus(reviewID, userID);
        if (status) {
          setHasLiked(status.hasLiked);
          setLikeCount(status.likeCount);
        }
      } catch (e) {
        console.error("โหลดสถานะไลค์ผิดพลาด:", e);
      }
    };
    load();
  }, [reviewID, userID]);

  const toggleLike = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const ok = hasLiked
        ? await onUnlikeButtonClick(reviewID, userID)
        : await onLikeButtonClick(reviewID, userID);

      if (ok) {
        const updated = await fetchLikeStatus(reviewID, userID);
        if (updated) {
          setHasLiked(updated.hasLiked);
          setLikeCount(updated.likeCount);
        }
      }
    } catch (e) {
      console.error("กดถูกใจผิดพลาด:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      {/* ข้อความช่วยถามแบบอ่านง่าย */}
      <span className="text-[12px] sm:text-[13px] leading-6 text-gray-600">
        {hasLiked ? "Thank you for your comments." : "Was this review helpful??"}
      </span>

      {/* ปุ่มถูกใจโทนฟ้า EV แบบมินิมอล */}
      <button
        onClick={toggleLike}
        disabled={loading}
        aria-pressed={hasLiked}
        aria-label="ถูกใจรีวิวนี้"
        className={[
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition",
          "shadow-sm border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
          hasLiked
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50",
        ].join(" ")}
      >
        <FontAwesomeIcon
          icon={faThumbsUp}
          className={hasLiked ? "text-white" : "text-blue-600"}
        />
        <span className="tabular-nums">{likeCount}</span>
      </button>
    </div>
  );
};

export default Like;
