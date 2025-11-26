import React, { useEffect, useState } from "react";
import { Card, Typography, Tag } from "antd";
import {
  RiMailLine,
  RiPhoneLine,
  RiMapPinLine,
  RiBugLine,
  RiExternalLinkLine,
} from "react-icons/ri";
import { ListServices } from "../../../../../services";
import { ServiceInterface } from "../../../../../interface/IService";

const { Text, Link, Paragraph } = Typography;

const SupportCard: React.FC = () => {
  const [service, setService] = useState<ServiceInterface | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const res = await ListServices();
      if (res && res.length > 0) {
        setService(res[0]); // ใช้ข้อมูลตัวแรกเท่านั้น
      }
    };
    fetchData();
  }, []);

  // ถ้ายังโหลดข้อมูลไม่เสร็จ
  if (!service) {
    return (
      <Card
        title="ติดต่อ / แจ้งปัญหา"
        className="rounded-2xl md:rounded-3xl shadow-sm border border-gray-100"
      >
        <p>Loading...</p>
      </Card>
    );
  }

  const quickMail = `mailto:${service.Email}?subject=${encodeURIComponent(
    "[EV Station] แจ้งปัญหา"
  )}&body=${encodeURIComponent(
    "สวัสดีทีมงาน EV Station,\n\nรายละเอียดปัญหา:\n- พบเมื่อ:\n- หน้าจอ/ฟีเจอร์:\n- หมายเลขผู้ใช้ (ถ้ามี):\n- ภาพหน้าจอ/วิดีโอ (ถ้ามี):\n\nขอบคุณครับ/ค่ะ"
  )}`;

  const quickCall = `tel:${service.Phone.replace(/\s+/g, "")}`;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span className="text-blue-600 text-xl">
            <RiBugLine />
          </span>
          <span className="text-gray-900 text-sm md:text-base font-bold">
            Service Desk
          </span>
          <Tag color="blue" className="ml-2 hidden md:inline-flex">
            Service Desk
          </Tag>
        </div>
      }
      className="rounded-2xl md:rounded-3xl shadow-sm border border-gray-100"
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
            <Link href={quickMail} target="_blank" className="text-sm md:text-base">
              {service.Email}
            </Link>
            <div className="mt-1 text-[12px] text-gray-500">
              Attaching screenshots/videos helps speed up verification.
            </div>
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
            <Link href={quickCall} className="text-sm md:text-base">
              {service.Phone}
            </Link>
            <div className="mt-1 text-[12px] text-gray-500">
              Call during business hours for urgent assistance.
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-start gap-3">
          <span className="text-xl text-blue-600 mt-0.5">
            <RiMapPinLine />
          </span>
          <div className="flex-1 min-w-0">
            <Text type="secondary" className="text-[12px] block">
              Station
            </Text>
            <Paragraph className="!mb-1 text-sm md:text-base">
              {service.Location}
            </Paragraph>
            <Link href={service.MapURL} target="_blank" className="text-[13px]">
              Open map <RiExternalLinkLine className="inline -mt-1 ml-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SupportCard;
