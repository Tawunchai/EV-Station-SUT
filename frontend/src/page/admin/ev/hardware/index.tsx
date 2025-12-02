// src/pages/admin/ev/HardwareModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Input,
  message,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { FaMicrochip, FaTimes } from "react-icons/fa";

import {
  ListHardwares,
  CreateHardware,
  UpdateHardwareByID,
  DeleteHardwareByID,
} from "../../../../services";
import type { HardwareInterface } from "../../../../interface/IHardware";

type HardwareModalProps = {
  open: boolean;
  onClose: () => void;
};

const { Paragraph } = Typography;

const HardwareModal: React.FC<HardwareModalProps> = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [hardwares, setHardwares] = useState<HardwareInterface[]>([]);
  const [searchText, setSearchText] = useState("");

  const [editing, setEditing] = useState<HardwareInterface | null>(null);

  const [name, setName] = useState("");
  const [hardwarePoint, setHardwarePoint] = useState("");
  const [urlWebsocket, setUrlWebsocket] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setHardwarePoint("");
    setUrlWebsocket("");
  };

  const loadHardwares = async () => {
    setLoading(true);
    try {
      const data = await ListHardwares();
      setHardwares(data ?? []);
    } catch (err) {
      console.error(err);
      message.error("Unable to load hardware data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHardwares();
      resetForm();
    }
  }, [open]);

  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return hardwares;
    return hardwares.filter((hw) => {
      const n = (hw.Name ?? "").toLowerCase();
      const p = (hw.HardwarePoint ?? "").toLowerCase();
      const u = (hw.UrlWebsocket ?? "").toLowerCase();
      return n.includes(q) || p.includes(q) || u.includes(q);
    });
  }, [hardwares, searchText]);

  const validate = () => {
    if (!name.trim()) {
      message.error("Please enter hardware name.");
      return false;
    }
    if (!hardwarePoint.trim()) {
      message.error("Please enter hardware point.");
      return false;
    }
    if (!urlWebsocket.trim()) {
      message.error("Please enter WebSocket URL.");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editing && editing.ID) {
        const payload: Partial<HardwareInterface> = {
          Name: name.trim(),
          HardwarePoint: hardwarePoint.trim(),
          UrlWebsocket: urlWebsocket.trim(),
        };
        const updated = await UpdateHardwareByID(editing.ID, payload);
        if (updated) {
          message.success("Hardware updated successfully.");
          await loadHardwares();
          resetForm();
        } else {
          message.error("Failed to update hardware.");
        }
      } else {
        const payload = {
          Name: name.trim(),
          HardwarePoint: hardwarePoint.trim(),
          UrlWebsocket: urlWebsocket.trim(),
        };
        const created = await CreateHardware(payload);
        if (created) {
          message.success("Hardware created successfully.");
          await loadHardwares();
          resetForm();
        } else {
          message.error("Failed to create hardware.");
        }
      }
    } catch (err) {
      console.error(err);
      message.error("An error occurred while saving data.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (hw: HardwareInterface) => {
    setEditing(hw);
    setName(hw.Name ?? "");
    setHardwarePoint(hw.HardwarePoint ?? "");
    setUrlWebsocket(hw.UrlWebsocket ?? "");
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    setDeletingId(id);
    try {
      const ok = await DeleteHardwareByID(id);
      if (ok) {
        message.success("Hardware deleted successfully.");
        await loadHardwares();
        if (editing?.ID === id) {
          resetForm();
        }
      } else {
        message.error("Failed to delete hardware.");
      }
    } catch (err) {
      console.error(err);
      message.error("An error occurred while deleting hardware.");
    } finally {
      setDeletingId(null);
    }
  };

  const columns: ColumnsType<HardwareInterface> = [
    {
      title: "Name",
      dataIndex: "Name",
      key: "name",
      width: 180,
      render: (v: string) => (
        <span className="font-semibold text-slate-900">{v}</span>
      ),
    },
    {
      title: "Hardware point",
      dataIndex: "HardwarePoint",
      key: "hardwarePoint",
      width: 160,
      render: (v: string) => (
        <Tag color="blue" className="px-2 py-1 rounded-md">
          {v}
        </Tag>
      ),
    },
    {
      title: "WebSocket URL",
      dataIndex: "UrlWebsocket",
      key: "urlWebsocket",
      width: 320,
      render: (v: string) => (
        <Tooltip title={v}>
          <Paragraph
            className="!mb-0 text-xs text-slate-600"
            copyable={{ tooltips: ["Copy", "Copied"] }}
            ellipsis={{ rows: 2 }}
          >
            {v}
          </Paragraph>
        </Tooltip>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_: any, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deletingId === record.ID}
            onClick={() => handleDelete(record.ID)}
          />
        </Space>
      ),
    },
  ];

  if (!open) return null;

  const isMobile = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 768px)").matches
        : false,
    []
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ev-scope"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-[1120px] mx-4 md:mx-auto mt-8 mb-6 md:my-0">
        <div
          className="bg-white rounded-3xl shadow-2xl overflow-hidden ring-1 ring-blue-100 flex flex-col"
          style={{ maxHeight: isMobile ? "86vh" : "84vh" }}
        >
          {/* Header */}
          <div
            className="px-6 pt-4 pb-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white flex justify-between items-center"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
          >
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20">
                <FaMicrochip className="opacity-90" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Hardware Management
                </h2>
                <p className="text-xs md:text-[13px] text-blue-100 mt-1">
                  Manage all hardware endpoints used by EV cabinets and sensors.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              title="Close"
              aria-label="Close"
              className="p-2 -m-2 rounded-xl hover:bg-white/10 disabled:opacity-50 leading-none inline-flex items-center justify-center"
            >
              <FaTimes />
            </button>
          </div>

          {/* Body */}
          <div
            className="flex-1 bg-[linear-gradient(180deg,#eef4ff_0%,#f6f8ff_40%,#ffffff_100%)] px-6 py-5 flex flex-col gap-4"
            style={{
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <Input
                allowClear
                size="large"
                prefix={<SearchOutlined />}
                placeholder="Search: Name / Hardware point / WebSocket URL"
                className="max-w-xl bg-white rounded-2xl shadow-sm"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <div className="flex items-center gap-2 justify-end">
                {editing && (
                  <span className="text-xs text-slate-500 mr-2 hidden md:inline">
                    Editing:{" "}
                    <span className="font-semibold text-blue-700">
                      {editing.Name}
                    </span>
                  </span>
                )}
                <Button
                  icon={<PlusOutlined />}
                  onClick={resetForm}
                  className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 rounded-xl"
                >
                  New hardware
                </Button>
              </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Table */}
              <div className="md:col-span-3 bg-white rounded-2xl shadow-sm border border-blue-100 p-4 flex flex-col min-h-[260px]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Hardware list
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Total {hardwares.length} items
                  </span>
                </div>
                <Table<HardwareInterface>
                  columns={columns}
                  dataSource={filteredData}
                  rowKey={(r) => r.ID ?? 0}
                  size="small"
                  loading={loading}
                  pagination={{
                    pageSize: 5,
                    showSizeChanger: true,
                    position: ["bottomCenter"],
                  }}
                  scroll={{ x: 800 }}
                  className="hardware-table"
                />
              </div>

              {/* Form */}
              <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-blue-100 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {editing ? "Edit hardware" : "Create hardware"}
                  </h3>
                  {editing && (
                    <Tag
                      color="blue"
                      className="text-[11px] px-2 py-1 rounded-lg"
                    >
                      Editing ID: {editing.ID}
                    </Tag>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mb-1">
                  Define a readable name, a unique hardware point, and the
                  WebSocket URL used to connect this hardware to the backend.
                </p>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-600">Name</span>
                  <input
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="e.g. Solar Hardware #1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">
                      Hardware point
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Used as a key from device, e.g. <b>hardware_001</b>
                    </span>
                  </div>
                  <input
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="e.g. hardware_001"
                    value={hardwarePoint}
                    onChange={(e) => setHardwarePoint(e.target.value)}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">
                      WebSocket URL
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Example: <b>wss://api.myserver.com/hardware/</b>
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-xs md:text-sm resize-none"
                    placeholder="e.g. wss://example.com/hardware/"
                    value={urlWebsocket}
                    onChange={(e) => setUrlWebsocket(e.target.value)}
                  />
                </label>

                <div className="mt-3 flex gap-2 justify-end">
                  <Button
                    onClick={resetForm}
                    disabled={submitting}
                    className="border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-xl"
                  >
                    Clear
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleSubmit}
                    loading={submitting}
                    className="bg-blue-600 rounded-xl"
                  >
                    {editing ? "Save changes" : "Create hardware"}
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center mt-1">
              Centralize all hardware connections for your EV and sensor
              network in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Scoped styles for table & select inside this modal */}
      <style>{`
        .hardware-table .ant-table-thead > tr > th {
          background: #f9fbff !important;
          color: #0f172a !important;
          border-bottom: 1px solid rgba(15,23,42,0.06) !important;
          font-weight: 600;
          font-size: 12px;
        }
        .hardware-table .ant-table-tbody > tr > td {
          border-color: rgba(15,23,42,0.06) !important;
          padding-top: 10px !important;
          padding-bottom: 10px !important;
          font-size: 12px;
        }
        .hardware-table .ant-table-tbody > tr:hover > td {
          background: #f4f7ff !important;
        }
        .hardware-table .ant-table-pagination {
          justify-content: center !important;
        }
      `}</style>
    </div>
  );
};

export default HardwareModal;
