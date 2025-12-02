import React, { useEffect, useState } from "react";
import { Card, Typography, message } from "antd";
import { useTranslation } from "react-i18next";
import { RiMailLine, RiPagesLine, RiPhoneLine } from "react-icons/ri";
import { getUserByID } from "../../../../../services";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";

const { Text, Link } = Typography;

const Contact: React.FC = () => {
  const { t } = useTranslation();
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // ✅ ดึงข้อมูลผู้ใช้จาก cookie หรือ memory
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        const userID = current?.id;
        if (!userID) {
          message.error("User information not found. Please log in again");
          return;
        }

        // ✅ ดึงข้อมูลผู้ใช้จาก backend
        const user = await getUserByID(userID);
        if (user) {
          setPhone(user.PhoneNumber || "");
          setEmail(user.Email || "");
        }
      } catch (err) {
        console.error("❌ Error fetching user contact:", err);
      }
    };

    fetchUser();
  }, []);

  return (
    <Card
      title={
        <span className="text-gray-900 text-sm md:text-base font-bold">
          {t("Contact")}
        </span>
      }
      className="mt-4 md:mt-0 rounded-2xl md:rounded-3xl shadow-sm border border-gray-100"
      classNames={{
        body: "pt-2 md:pt-3",
        header: "border-0 bg-white rounded-t-2xl md:rounded-t-3xl",
      }}
      bordered={false}
    >
      <div className="flex flex-col gap-6">
        {/* Email */}
        <div className="flex items-start gap-3">
          <span className="text-xl text-blue-600 mt-0.5">
            <RiMailLine />
          </span>
          <div className="flex-1 min-w-0">
            <Text type="secondary" className="text-[12px] block">
              Email
            </Text>
            <Link
              href={`mailto:${email}`}
              target="_blank"
              className="text-sm md:text-base"
            >
              {email || "-"}
            </Link>
          </div>
        </div>

        {/* Web Page */}
        <div className="flex items-start gap-3">
          <span className="text-xl text-blue-600 mt-0.5">
            <RiPagesLine />
          </span>
          <div className="flex-1 min-w-0">
            <Text type="secondary" className="text-[12px] block">
              Web page
            </Text>
            <Link
              href="https://evstation-sut.it.com"
              target="_blank"
              className="text-sm md:text-base"
            >
              evstation-sut.it.com
            </Link>
          </div>
        </div>

        {/* Phone */}
        <div className="flex items-start gap-3">
          <span className="text-xl text-blue-600 mt-0.5">
            <RiPhoneLine />
          </span>
          <div className="flex-1 min-w-0">
            <Text type="secondary" className="text-[12px] block">
              Phone
            </Text>
            <Link
              href={`tel:${phone}`}
              target="_blank"
              className="text-sm md:text-base"
            >
              {phone || "-"}
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
};

export { Contact };
