// src/pages/admin/ev/EV.tsx  (หรือชื่อเดิมของไฟล์นี้)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  Image as AntImage,
  Tag,
  Space,
  Button,
  Input,
  message,
  Spin,
  Empty,
} from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Trash2 } from "react-feather";

import {
  ListEVCharging,
  DeleteEVcharging,
  ListStatus,
  ListTypeEV,
  ListCabinetsEV,
  DeleteEVCabinetByID,
  apiUrlPicture,
} from "../../../services";

import { GetProfile } from "../../../services/httpLogin";

import type { StatusInterface } from "../../../interface/IStatus";
import type { TypeInterface } from "../../../interface/IType";

import EditEVModal from "./charge/edit";
import CreateEVModal from "./charge/create";
import HardwareModal from "./hardware";

// ⭐ Modal ใหม่ที่เราแยกไฟล์ออกไป
import ModalCreateCabinet from "./cabinet/create";
import ModalUpdateCabinet from "./cabinet/edit";

// ---------- Interfaces ----------
type RowType = {
  key: number;
  ID: number;
  Name: string;
  Email: string;
  Description: string;
  Price: number;
  Type: string;
  EnergySource: string;
  Status: string;
  EmployeeName: string;
  Picture: string;
  EmployeeID?: number;
  StatusID?: number;
  TypeID?: number;
  EnergySourceID?: number;
  Raw: any;
};

export type CabinetType = {
  ID: number;
  Name: string;
  Location: string;
  Status: string;
  Image: string;
  Description?: string;
  Latitude?: number;
  Longitude?: number;
  EmployeeID?: number | null;
  UrlWebsocket?: string | null;
  ChargePoint?: string | null;
  HardwareID?: number | null;
  StopPolicy?: number | null;
};

// ---------- Small Centered Modal Wrapper ----------
const EvModal: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-[420px] mx-4 md:mx-auto">
        <div className="mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-blue-100">
          {children}
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>
    </div>
  );
};

const EV: React.FC = () => {
  // ⭐ role state
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAdmin = userRole?.toLowerCase() === "admin";

  // ---------- EV Stations ----------
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState<RowType[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState("");

  const [statusList, setStatusList] = useState<StatusInterface[]>([]);
  const [typeList, setTypeList] = useState<TypeInterface[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEV, setEditingEV] = useState<any>(null);

  // Single delete modal for EV Station
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const selectedEVRef = useRef<RowType | null>(null);

  // ---------- EV Cabinets ----------
  const [cabinets, setCabinets] = useState<CabinetType[]>([]);
  const [loadingCabinets, setLoadingCabinets] = useState(false);

  // แยก state สำหรับ create / update
  const [createCabinetOpen, setCreateCabinetOpen] = useState(false);
  const [updateCabinetOpen, setUpdateCabinetOpen] = useState(false);
  const [editingCabinet, setEditingCabinet] = useState<CabinetType | null>(null);

  // Cabinet delete modal (สไตล์เดียวกับ Charger)
  const [openCabinetConfirm, setOpenCabinetConfirm] = useState(false);
  const [confirmCabinetLoading, setConfirmCabinetLoading] = useState(false);
  const selectedCabinetRef = useRef<CabinetType | null>(null);

  const [openCabinetListModal, setOpenCabinetListModal] = useState(false);
  const [selectedCabinets, setSelectedCabinets] = useState<any[]>([]);

  // ⭐ Hardware Modal
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);

  // ✅ Responsive scrollX
  const [scrollX, setScrollX] = useState(960);

  useEffect(() => {
    const updateScrollX = () => {
      if (window.innerWidth <= 1300 && window.innerWidth >= 768) {
        // iPad
        setScrollX(830);
      } else {
        setScrollX(960);
      }
    };

    updateScrollX();
    window.addEventListener("resize", updateScrollX);
    return () => window.removeEventListener("resize", updateScrollX);
  }, []);

  // ⭐ โหลด role ของผู้ใช้จาก token
  useEffect(() => {
    const loadRole = async () => {
      try {
        const res: any = await GetProfile();
        setUserRole(res?.data?.role || null);
      } catch {
        setUserRole(null);
      }
    };
    loadRole();
  }, []);

  // ---------- Fetch ----------
  const fetchEVData = async () => {
    setLoading(true);
    try {
      const evs = await ListEVCharging();
      if (evs) {
        const rows: RowType[] = evs.map((ev: any) => {
          const id = Number(ev.ID);
          return {
            key: id,
            ID: id,
            Name: ev.Name ?? "-",
            Email: ev.Employee?.User?.Email ?? "-",
            Description: ev.Description ?? "-",
            Price: Number(ev.Price ?? 0),
            Type: ev.Type?.Type ?? "-",
            EnergySource: ev.EnergySource?.Name ?? "-",
            Status: ev.Status?.Status ?? "-",
            EmployeeName: Array.isArray(ev.Cabinets)
              ? ev.Cabinets.map((cab: any) => cab.Name).join(", ")
              : "-",
            Picture: ev.Picture ?? "",
            EmployeeID: ev.EmployeeID,
            StatusID: ev.StatusID,
            TypeID: ev.TypeID,
            EnergySourceID: ev.EnergySourceID,
            Raw: ev,
          };
        });
        setTableData(rows);
      } else {
        setTableData([]);
      }
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถโหลดข้อมูล EV Charging ได้");
    } finally {
      setLoading(false);
    }
  };

  const fetchLists = async () => {
    try {
      const [statuses, types] = await Promise.all([ListStatus(), ListTypeEV()]);
      if (statuses) setStatusList(statuses);
      if (types) setTypeList(types);
    } catch {
      // ไม่ critical
    }
  };

  const fetchCabinets = async () => {
    setLoadingCabinets(true);
    try {
      const res = await ListCabinetsEV();
      if (res && Array.isArray(res)) {
        setCabinets(
          res.map((c: any) => ({
            ID: c.ID,
            Name: c.Name,
            Location: c.Location,
            Status: c.Status,
            Image: c.Image,
            Description: c.Description,
            Latitude: c.Latitude,
            Longitude: c.Longitude,
            EmployeeID: c.EmployeeID ?? null,
            UrlWebsocket: c.UrlWebsocket ?? null,
            ChargePoint: c.ChargePoint ?? null,
            HardwareID: c.HardwareID ?? null, // ⭐ map มาด้วย
            StopPolicy: c.StopPolicy ?? null,
          }))
        );
      } else {
        setCabinets([]);
      }
    } catch {
      message.error("ไม่สามารถโหลดข้อมูล EV Cabinets ได้");
    } finally {
      setLoadingCabinets(false);
    }
  };

  useEffect(() => {
    fetchEVData();
    fetchLists();
    fetchCabinets();
  }, []);

  // ---------- Search ----------
  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return tableData;
    return tableData.filter(
      (r) =>
        (r.Name ?? "").toLowerCase().includes(q) ||
        (r.Email ?? "").toLowerCase().includes(q) ||
        (r.Type ?? "").toLowerCase().includes(q) ||
        (r.EnergySource ?? "").toLowerCase().includes(q) ||
        (r.Status ?? "").toLowerCase().includes(q) ||
        (r.EmployeeName ?? "").toLowerCase().includes(q)
    );
  }, [tableData, searchText]);

  // ---------- EV Delete (Single) ----------
  const openDeleteModal = (record: RowType) => {
    if (!isAdmin) return;
    selectedEVRef.current = record;
    setOpenConfirmModal(true);
  };
  const cancelDelete = () => {
    setOpenConfirmModal(false);
    selectedEVRef.current = null;
    setConfirmLoading(false);
  };
  const confirmDelete = async () => {
    if (!isAdmin) return;
    if (!selectedEVRef.current) return;
    setConfirmLoading(true);
    const ok = await DeleteEVcharging(selectedEVRef.current.ID);
    if (ok) {
      message.success("Data deletion successful");
      await fetchEVData();
    } else {
      message.error("An error occurred while deleting.");
    }
    cancelDelete();
  };

  // ---------- EV Bulk Delete ----------
  const handleBulkDelete = async () => {
    if (!isAdmin) return;
    if (selectedRowKeys.length === 0) return;

    const ids = selectedRowKeys.map((id) => Number(id));
    const results = await Promise.all(ids.map((id) => DeleteEVcharging(id)));
    const failed = results.some((r) => !r);

    if (!failed) {
      message.success("ลบข้อมูลสำเร็จ");
      setSelectedRowKeys([]);
      fetchEVData();
    } else {
      message.error("ลบบางรายการไม่สำเร็จ");
    }
  };

  // ---------- EV Edit / Create ----------
  const openEdit = (row: RowType) => {
    if (!isAdmin) return;
    setEditingEV(row.Raw);
    setEditOpen(true);
  };
  const onSavedEdit = async () => {
    setEditOpen(false);
    setEditingEV(null);
    await fetchEVData();
  };
  const onSavedCreate = async () => {
    setCreateOpen(false);
    await fetchEVData();
  };

  // ---------- EV Table Columns (Admin เท่านั้นถึงเห็น Action) ----------
  const columns: ColumnsType<RowType> = useMemo(() => {
    const base: ColumnsType<RowType> = [
      {
        title: "Name",
        dataIndex: "Name",
        key: "station",
        sorter: (a, b) => a.Name.localeCompare(b.Name),
        render: (_, record) => (
          <Space size="middle">
            <AntImage
              src={
                record.Picture
                  ? `${apiUrlPicture}${record.Picture}`
                  : "https://via.placeholder.com/64x64.png?text=EV"
              }
              width={40}
              height={40}
              preview={false}
              className="rounded-lg object-cover"
            />
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{record.Name || "-"}</div>
              <div className="text-gray-500 text-xs truncate">{record.Email}</div>
            </div>
          </Space>
        ),
      },
      {
        title: "Type",
        dataIndex: "Type",
        key: "type",
        width: 120,
        filters: [...Array.from(new Set(tableData.map((t) => t.Type)))].map((v) => ({
          text: v,
          value: v,
        })),
        onFilter: (val, rec) => rec.Type === val,
        render: (v) => (
          <Tag color="blue" className="px-2 py-1 rounded-md">
            {v}
          </Tag>
        ),
      },
      {
        title: "Energy Source",
        dataIndex: "EnergySource",
        key: "energySource",
        width: 140,
        filters: [...Array.from(new Set(tableData.map((t) => t.EnergySource)))].map((v) => ({
          text: v,
          value: v,
        })),
        onFilter: (val, rec) => rec.EnergySource === val,
        render: (v) => (
          <Tag color="geekblue" className="px-2 py-1 rounded-md">
            {v}
          </Tag>
        ),
      },
      {
        title: "Status",
        dataIndex: "Status",
        key: "status",
        width: 120,
        filters: [...Array.from(new Set(tableData.map((t) => t.Status)))].map((v) => ({
          text: v,
          value: v,
        })),
        onFilter: (val, rec) => rec.Status === val,
        render: (v) => (
          <Tag
            color={v?.toLowerCase().includes("active") ? "green" : "orange"}
            className="px-2 py-1 rounded-md"
          >
            {v}
          </Tag>
        ),
      },
      {
        title: "Price",
        dataIndex: "Price",
        key: "price",
        width: 100,
        sorter: (a, b) => a.Price - b.Price,
        render: (v) => (
          <span className="font-semibold text-blue-700">{Number(v).toLocaleString()}</span>
        ),
      },
      {
        title: "EV Cabinet",
        key: "cabinets",
        width: 180,
        render: (_, record) => {
          const cabs = record.Raw?.Cabinets || [];

          if (!Array.isArray(cabs) || cabs.length === 0) return <span className="text-gray-400">-</span>;

          if (cabs.length === 1)
            return <span className="font-medium text-blue-700">{cabs[0].Name}</span>;

          return (
            <button
              onClick={() => {
                setSelectedCabinets(cabs);
                setOpenCabinetListModal(true);
              }}
              className="px-2 py-1 text-blue-600 underline hover:text-blue-800"
            >
              {cabs.length} Cabinets
            </button>
          );
        },
      },
    ];

    if (isAdmin) {
      base.push({
        title: "Action",
        key: "action",
        width: 150,
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              className="border-blue-200 text-blue-700"
              onClick={() => openEdit(record)}
            >
              Edit
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => openDeleteModal(record)} />
          </Space>
        ),
      });
    }

    return base;
  }, [tableData, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Selection (Admin เท่านั้นถึงเลือกแถวได้) ----------
  const rowSelection: TableProps<RowType>["rowSelection"] | undefined = useMemo(() => {
    if (!isAdmin) return undefined;
    return {
      selectedRowKeys,
      onChange: (keys) => setSelectedRowKeys(keys),
    };
  }, [isAdmin, selectedRowKeys]);

  // ---------- Cabinet actions ----------
  const openCreateCabinet = () => {
    if (!isAdmin) return;
    setEditingCabinet(null);
    setCreateCabinetOpen(true);
  };
  const openEditCabinet = (cab: CabinetType) => {
    if (!isAdmin) return;
    setEditingCabinet(cab);
    setUpdateCabinetOpen(true);
  };

  // เปิด modal ยืนยันลบ Cabinet
  const openDeleteCabinetModal = (cab: CabinetType) => {
    if (!isAdmin) return;
    selectedCabinetRef.current = cab;
    setOpenCabinetConfirm(true);
  };
  const cancelDeleteCabinet = () => {
    setOpenCabinetConfirm(false);
    selectedCabinetRef.current = null;
    setConfirmCabinetLoading(false);
  };
  const confirmDeleteCabinet = async () => {
    if (!isAdmin) return;
    if (!selectedCabinetRef.current) return;
    setConfirmCabinetLoading(true);
    const ok = await DeleteEVCabinetByID(selectedCabinetRef.current.ID);
    if (ok) {
      message.success("ลบ Cabinet สำเร็จ");
      await fetchCabinets();
    } else {
      message.error("ไม่สามารถลบ Cabinet ได้");
    }
    cancelDeleteCabinet();
  };

  const onSavedCabinet = async () => {
    await fetchCabinets();
  };

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,#eaf2ff_0%,#f6f9ff_60%,#ffffff_100%)] mt-14 sm:mt-0">
      {/* Header */}
      <div
        className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">EV Charging Stations</h1>

          {/* Role badge (optional) */}
          <div className="text-xs opacity-90">
            {userRole ? (
              <span className="px-2 py-1 rounded-lg bg-white/15 border border-white/20">
                Role: {userRole}
              </span>
            ) : (
              <span className="px-2 py-1 rounded-lg bg-white/10 border border-white/15">Role: -</span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 py-6">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="ค้นหา: ชื่อ / อีเมล / สถานะ / ประเภท / แหล่งพลังงาน / ผู้ดูแล"
            className="max-w-xl"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          {/* ปุ่มควบคุม (Admin เท่านั้น) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                className="bg-blue-600"
                onClick={() => setCreateOpen(true)}
              >
                Create Station
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={selectedRowKeys.length === 0}
                onClick={handleBulkDelete}
                className="bg-white text-red-600 hover:bg-white/90"
              >
                ลบที่เลือก ({selectedRowKeys.length})
              </Button>
            </div>
          )}
        </div>

        {/* Stations Table */}
        <div className="rounded-xl overflow-hidden ring-1 ring-blue-100 bg-white mb-8">
          <Table<RowType>
            rowSelection={rowSelection}
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

        {/* EV Cabinets Header */}
        <div className="mt-8 mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-blue-700">EV Cabinets</h2>

          {/* ปุ่มควบคุม (Admin เท่านั้น) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              {/* ปุ่ม Hardware → เปิด Modal Hardware */}
              <Button
                className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={() => setHardwareModalOpen(true)}
              >
                Hardware
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                className="bg-blue-600"
                onClick={openCreateCabinet}
              >
                Add Cabinet
              </Button>
            </div>
          )}
        </div>

        {/* EV Cabinets Grid */}
        {loadingCabinets ? (
          <div className="flex justify-center items-center h-32">
            <Spin size="large" />
          </div>
        ) : cabinets.length === 0 ? (
          <Empty description="ไม่มีข้อมูล EV Cabinets" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cabinets.map((cab) => (
              <div
                key={cab.ID}
                className="bg-white rounded-xl border border-blue-100 shadow hover:shadow-md transition-all p-4 flex flex-col gap-2"
              >
                <img
                  src={
                    cab.Image
                      ? `${apiUrlPicture}${cab.Image}`
                      : "https://via.placeholder.com/300x180.png?text=EV+Cabinet"
                  }
                  alt={cab.Name}
                  className="rounded-lg h-36 object-cover"
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-blue-800 truncate">{cab.Name}</h3>
                    <p className="text-sm text-gray-500 truncate">{cab.Location}</p>
                    <Tag
                      color={
                        cab.Status?.toLowerCase().includes("active")
                          ? "green"
                          : cab.Status?.toLowerCase().includes("maintenance")
                            ? "orange"
                            : "default"
                      }
                      className="mt-1"
                    >
                      {cab.Status}
                    </Tag>
                  </div>

                  {/* ปุ่มแก้ไข/ลบ (Admin เท่านั้น) */}
                  {isAdmin && (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditCabinet(cab)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => openDeleteCabinetModal(cab)}
                      />
                    </Space>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Station Modals (Admin เท่านั้น) */}
        {isAdmin && editOpen && (
          <EditEVModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            evCharging={editingEV}
            onSaved={onSavedEdit}
            statusList={statusList}
            typeList={typeList}
          />
        )}
        {isAdmin && createOpen && (
          <CreateEVModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onSaved={onSavedCreate}
            statusList={statusList}
            typeList={typeList}
          />
        )}

        {/* Cabinet Create / Update Modals (Admin เท่านั้น) */}
        {isAdmin && createCabinetOpen && (
          <ModalCreateCabinet
            open={createCabinetOpen}
            onClose={() => setCreateCabinetOpen(false)}
            onSaved={onSavedCabinet}
          />
        )}

        {isAdmin && updateCabinetOpen && editingCabinet && (
          <ModalUpdateCabinet
            open={updateCabinetOpen}
            onClose={() => setUpdateCabinetOpen(false)}
            onSaved={onSavedCabinet}
            initial={editingCabinet}
          />
        )}

        {/* Hardware Modal (Admin เท่านั้น) */}
        {isAdmin && hardwareModalOpen && (
          <HardwareModal open={hardwareModalOpen} onClose={() => setHardwareModalOpen(false)} />
        )}

        {/* Confirm Delete Station (Admin เท่านั้น) */}
        {isAdmin && (
          <EvModal open={openConfirmModal} onClose={cancelDelete}>
            <div className="w-[min(92vw,420px)] text-center px-5 py-5">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
                <Trash2 size={22} className="text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">ยืนยันการลบสถานีชาร์จ</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                คุณต้องการลบ{" "}
                <span className="font-semibold text-blue-700">“{selectedEVRef.current?.Name}”</span>{" "}
                ใช่หรือไม่?
                <br />
                <span className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={confirmDelete}
                  disabled={confirmLoading}
                  className="min-w-[96px] h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-200 transition disabled:opacity-60"
                >
                  {confirmLoading ? "กำลังลบ..." : "ลบ"}
                </button>
                <button
                  onClick={cancelDelete}
                  className="min-w-[96px] h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </EvModal>
        )}

        {/* Confirm Delete Cabinet (Admin เท่านั้น) */}
        {isAdmin && (
          <EvModal open={openCabinetConfirm} onClose={cancelDeleteCabinet}>
            <div className="w-[min(92vw,420px)] text-center px-5 py-5">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
                <Trash2 size={22} className="text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">ยืนยันการลบ Cabinet</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                คุณต้องการลบ{" "}
                <span className="font-semibold text-blue-700">
                  “{selectedCabinetRef.current?.Name}”
                </span>{" "}
                ใช่หรือไม่?
                <br />
                <span className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={confirmDeleteCabinet}
                  disabled={confirmCabinetLoading}
                  className="min-w-[96px] h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-200 transition disabled:opacity-60"
                >
                  {confirmCabinetLoading ? "กำลังลบ..." : "ลบ"}
                </button>
                <button
                  onClick={cancelDeleteCabinet}
                  className="min-w-[96px] h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </EvModal>
        )}

        {/* Cabinet List Modal เมื่อกด x Cabinets (ทุก role ดูได้) */}
        {openCabinetListModal && (
          <EvModal open={openCabinetListModal} onClose={() => setOpenCabinetListModal(false)}>
            <div className="w-[min(92vw,420px)] px-6 py-5">
              <h3 className="text-lg font-bold text-center text-blue-700 mb-4">รายการ EV Cabinets</h3>

              <div
                className="space-y-3"
                style={{
                  maxHeight: selectedCabinets.length > 2 ? "55vh" : "auto",
                  overflowY: selectedCabinets.length > 2 ? "auto" : "visible",
                  WebkitOverflowScrolling: "touch",
                  paddingRight: selectedCabinets.length > 2 ? "6px" : "0",
                }}
              >
                {selectedCabinets.map((cab) => (
                  <div key={cab.ID} className="p-4 rounded-xl border border-blue-100 shadow-sm bg-white">
                    <img
                      src={
                        cab.Image
                          ? `${apiUrlPicture}${cab.Image}`
                          : "https://via.placeholder.com/300x180.png?text=EV+Cabinet"
                      }
                      className="w-full h-32 object-cover rounded-lg mb-2"
                      alt={cab.Name}
                    />

                    <div className="font-semibold text-blue-800">{cab.Name}</div>
                    <div className="text-sm text-gray-500">{cab.Location}</div>

                    <div className="mt-1">
                      <Tag
                        color={
                          cab.Status?.toLowerCase().includes("active")
                            ? "green"
                            : cab.Status?.toLowerCase().includes("maintenance")
                              ? "orange"
                              : "default"
                        }
                      >
                        {cab.Status}
                      </Tag>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setOpenCabinetListModal(false)}
                  className="px-4 h-10 rounded-xl bg-blue-600 text-white"
                >
                  ปิด
                </button>
              </div>
            </div>
          </EvModal>
        )}

        <p className="text-[12px] text-gray-500 text-center mt-8">
          โทนฟ้าสบายตา • มินิมอล • รองรับมือถือ/เดสก์ท็อป
        </p>
      </div>

      {/* Scoped table styles */}
      <style>{`
        .ev-ant-table .ant-table-thead > tr > th {
          background: #fff !important;
          color: #0f172a !important;
          border-bottom: 1px solid rgba(2,6,23,0.06) !important;
          font-weight: 700; font-size: 13px; letter-spacing: .2px;
        }
        .ev-ant-table .ant-table-tbody > tr > td {
          border-color: rgba(2,6,23,0.06) !important;
          padding-top: 12px !important; padding-bottom: 12px !important;
        }
        .ev-ant-table .ant-table-tbody > tr:hover > td { background: #f8fafc !important; }
        .ev-ant-table .ant-table-tbody > tr:nth-child(even) > td { background: #fcfcff; }
        .ev-ant-table .ant-table-pagination { justify-content: center !important; }
        .ev-ant-table .ant-pagination .ant-pagination-item-active { border-color: rgba(2,6,23,0.2) !important; }
        .ev-ant-table .ant-pagination .ant-pagination-item-active a { color: #0f172a !important; font-weight: 600; }
      `}</style>
    </div>
  );
};

export default EV;
