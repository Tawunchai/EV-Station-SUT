import React, { JSX, useEffect, useMemo, useRef, useState } from "react";
import { Table, Button, Input, Tag, Space, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  DownloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { ListCars, DeleteCar, apiUrlPicture } from "../../../services";
import type { CarsInterface } from "../../../interface/ICar";
import { FaCarSide, FaTruckPickup, FaTaxi, FaBusAlt } from "react-icons/fa";
import { Trash2 } from "react-feather";
import { utils, writeFile } from "xlsx";
import ModalEditCar from "./edit";

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
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>
    </div>
  );
};

// -------------------- Row Type --------------------
type RowType = {
  key: number;
  Index: number;
  Icon: JSX.Element;
  Brand: string;
  ModelCar: string;
  LicensePlate: string;
  City: string;
  SpecialNumber?: boolean;
  ID: number;
  UserName: string;
  Raw: CarsInterface;
};

const CarList: React.FC = () => {
  const [cars, setCars] = useState<RowType[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [editCar, setEditCar] = useState<any | null>(null);

  const navigate = useNavigate(); // ✅ ใช้ navigate ไปหน้า CarData

  // ✅ Responsive scrollX
  const [scrollX, setScrollX] = useState(1000);

  useEffect(() => {
    const updateScrollX = () => {
      if (window.innerWidth <= 1180 && window.innerWidth >= 768) {
        // iPad
        setScrollX(830);
      } else {
        setScrollX(1000);
      }
    };

    updateScrollX();
    window.addEventListener("resize", updateScrollX);
    return () => window.removeEventListener("resize", updateScrollX);
  }, []);

  // Confirm Delete Modal
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const selectedCarRef = useRef<RowType | null>(null);

  const carIcons = [FaCarSide, FaTruckPickup, FaTaxi, FaBusAlt];
  const randomIcon = () => {
    const Icon = carIcons[Math.floor(Math.random() * carIcons.length)];
    return <Icon className="text-blue-600 text-lg mr-2" />;
  };

  // -------- Fetch cars --------
  const fetchCars = async () => {
    setLoading(true);
    try {
      const res = await ListCars();
      if (res) {
        const rows: RowType[] = res.map((c: CarsInterface, i: number) => {
          const ownerNames =
            c.User && c.User.length > 0
              ? c.User.map((u) => `${u.FirstName || ""} ${u.LastName || ""}`).join(", ")
              : "-";
          return {
            key: i + 1,
            Index: i + 1,
            Icon: randomIcon(),
            Brand: c.Brand ?? "",
            ModelCar: c.ModelCar ?? "",
            LicensePlate: c.LicensePlate ?? "",
            City: c.City ?? "",
            SpecialNumber: c.SpecialNumber ?? false,
            ID: c.ID ?? 0,
            UserName: ownerNames,
            Raw: c,
          };
        });
        setCars(rows);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCars();
  }, []);

  // -------- Delete Car --------
  const openDeleteModal = (record: RowType) => {
    selectedCarRef.current = record;
    setOpenConfirmModal(true);
  };

  const cancelDelete = () => {
    setOpenConfirmModal(false);
    selectedCarRef.current = null;
    setConfirmLoading(false);
  };

  const confirmDelete = async () => {
    if (!selectedCarRef.current) return;
    setConfirmLoading(true);

    const idToDelete = selectedCarRef.current.ID;
    const ok = await DeleteCar(idToDelete);

    if (ok) {
      message.success("Vehicle deleted successfully");
      setCars((prev) => prev.filter((c) => c.ID !== idToDelete));
    } else {
      message.error("An error occurred while deleting");
    }
    cancelDelete();
  };

  // -------- Export CSV --------
  const handleExportCSV = () => {
    if (cars.length === 0) {
      message.warning("ไม่มีข้อมูลให้ดาวน์โหลด");
      return;
    }
    const data = cars.map((c) => ({
      No: c.Index,
      Brand: c.Brand,
      Model: c.ModelCar,
      LicensePlate: c.LicensePlate,
      City: c.City,
      SpecialNumber: c.SpecialNumber ? "Yes" : "No",
      Owner: c.UserName,
    }));
    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Cars");
    writeFile(wb, "car_list.xlsx");
    message.success("ดาวน์โหลดไฟล์สำเร็จ");
  };

  // -------- Search filter --------
  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return cars;
    return cars.filter(
      (r) =>
        r.Brand.toLowerCase().includes(q) ||
        r.ModelCar.toLowerCase().includes(q) ||
        r.LicensePlate.toLowerCase().includes(q) ||
        r.City.toLowerCase().includes(q) ||
        r.UserName.toLowerCase().includes(q)
    );
  }, [cars, searchText]);

  // -------- Columns --------
  const columns: ColumnsType<RowType> = [
    {
      title: "No.",
      dataIndex: "Index",
      key: "index",
      width: 60,
      align: "center",
      render: (_, record) => <span className="font-semibold">{record.Index}</span>,
    },
    {
      title: "Brand / Icon",
      dataIndex: "Brand",
      key: "brand",
      sorter: (a, b) => a.Brand.localeCompare(b.Brand),
      render: (_, record) => (
        <div className="flex items-center">
          {record.Icon}
          <span className="font-semibold text-gray-900">{record.Brand}</span>
        </div>
      ),
    },
    {
      title: "Model",
      dataIndex: "ModelCar",
      key: "model",
      sorter: (a, b) => a.ModelCar.localeCompare(b.ModelCar),
      render: (v) => <span className="text-gray-800">{v}</span>,
    },
    {
      title: "License Plate",
      dataIndex: "LicensePlate",
      key: "license_plate",
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "City",
      dataIndex: "City",
      key: "city",
      render: (v) => <span className="text-gray-700">{v}</span>,
    },
    {
      title: "Special",
      dataIndex: "SpecialNumber",
      key: "special",
      render: (v) =>
        v ? (
          <Tag color="gold" className="font-semibold ml-15">
            ทะเบียนพิเศษ
          </Tag>
        ) : (
          <Tag color="default">ทะเบียนธรรมดา</Tag>
        ),
    },
    {
      title: "Owner",
      dataIndex: "UserName",
      key: "user",
      render: (_, record) => {
        const user = record.Raw.User?.[0];
        if (!user)
          return <span className="text-gray-400 italic">ไม่พบข้อมูลผู้ใช้</span>;

        const avatarUrl = user.Profile
          ? `${apiUrlPicture}${user.Profile}`
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(
              `${user.FirstName} ${user.LastName}`
            )}&background=0D8ABC&color=fff&size=40`;

        return (
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl}
              alt={user.FirstName}
              className="w-10 h-10 rounded-full object-cover border border-gray-200"
            />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-gray-900">
                {user.FirstName} {user.LastName}
              </span>
              <span className="text-xs text-gray-500">{user.Username}</span>
              <span className="text-xs text-gray-500">{user.Email}</span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      width: 140,
      fixed: "right",
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            className="border-blue-200 text-blue-700"
            onClick={() => setEditCar(record.Raw)}
          >
            Edit
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => openDeleteModal(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="min-h-screen w-full bg-white mt-14 sm:mt-0">
      <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">
            Cars
          </h1>
          <div className="flex gap-2">
            <Button
              icon={<SettingOutlined />}
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold"
              onClick={() => navigate("/admin/Car-data")} // ✅ ไปยังหน้า CarData
            >
              Manage Data
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold"
            >
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 py-6">
        <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="ค้นหา: ยี่ห้อ / รุ่น / ทะเบียน / จังหวัด / เจ้าของ"
            className="max-w-xl"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <div className="rounded-xl overflow-hidden ring-1 ring-blue-100 bg-white mb-10">
          <Table<RowType>
            columns={columns}
            dataSource={filteredData}
            loading={loading}
            scroll={{ x: scrollX }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              position: ["bottomCenter"],
            }}
            className="ev-ant-table"
            size="middle"
          />
        </div>

        <p className="text-[12px] text-gray-500 text-center mt-10">
          EV Blue • มินิมอล • รองรับมือถือ
        </p>
      </div>

      {/* ✅ Modal Edit Car */}
      {editCar && (
        <ModalEditCar
          open={!!editCar}
          car={editCar}
          onClose={() => setEditCar(null)}
          onUpdated={fetchCars}
        />
      )}

      {/* ✅ Confirm Delete Modal */}
      <EvModal open={openConfirmModal} onClose={cancelDelete}>
        <div className="w-[min(92vw,420px)] px-5 py-5 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
            <Trash2 size={22} className="text-blue-600" />
          </div>
          <h3 className="text-base font-bold text-slate-900">ยืนยันการลบข้อมูลรถ</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            คุณต้องการลบรถ{" "}
            <span className="font-semibold text-blue-700">
              “{selectedCarRef.current?.Brand}”
            </span>{" "}
            ใช่หรือไม่?
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={confirmDelete}
              disabled={confirmLoading}
              className="min-w-[96px] h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
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

export default CarList;
