import React, { useEffect, useState } from "react";
import {
  Card,
  Tag,
  Typography,
  Empty,
  Spin,
  Button,
  message,
} from "antd";
import {
  RiCarLine,
  RiCheckboxCircleLine,
  RiAddLine,
  RiBusLine,
  RiTaxiLine,
  RiTruckLine,
  RiMotorbikeLine,
  RiCarWashingLine,
  RiEdit2Line,
} from "react-icons/ri";
import { GetCarByUserID } from "../../../../../services";
import { CarsInterface } from "../../../../../interface/ICar";
import { useNavigate } from "react-router-dom";
import EditCarModal from "./edit"; // ✅ เรียก modal component ที่คุณทำไว้

const { Text, Paragraph } = Typography;

interface CarsProps {
  userID: number;
}

// ✅ ฟังก์ชันสุ่มไอคอนรถ
const getRandomCarIcon = (id: number) => {
  const icons = [
    RiCarLine,
    RiBusLine,
    RiTaxiLine,
    RiTruckLine,
    RiMotorbikeLine,
    RiCarWashingLine,
  ];
  const index = id % icons.length;
  return icons[index];
};

const Cars: React.FC<CarsProps> = ({ userID }) => {
  const [cars, setCars] = useState<CarsInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCar, setEditingCar] = useState<CarsInterface | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCars = async () => {
      try {
        const res = await GetCarByUserID(userID);
        if (res) setCars(res);
      } catch (error) {
        console.error("Error fetching cars:", error);
        message.error("ไม่สามารถโหลดข้อมูลรถได้");
      } finally {
        setLoading(false);
      }
    };
    fetchCars();
  }, [userID]);

  // ✅ เปิด modal
  const handleEdit = (car: CarsInterface) => {
    setEditingCar(car);
    setIsModalOpen(true);
  };

  // ✅ อัปเดตข้อมูลใน state หลังแก้ไขเสร็จ
  const handleCarUpdated = (updatedCar: CarsInterface) => {
    setCars((prev) =>
      prev.map((c) => (c.ID === updatedCar.ID ? updatedCar : c))
    );
  };

  return (
    <>
      <Card
        title={
          <div className="flex items-center gap-2">
            <span className="text-blue-600 text-xl">
              <RiCarLine />
            </span>
            <span className="text-gray-900 text-sm md:text-base font-bold">
              My Vehicles
            </span>
            <Tag color="blue" className="ml-2 hidden md:inline-flex">
              My Vehicles
            </Tag>
          </div>
        }
        className="mt-4 rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 bg-blue-50"
        classNames={{
          body: "pt-2 md:pt-3",
          header: "border-0 bg-blue-100 rounded-t-2xl md:rounded-t-3xl",
        }}
        bordered={false}
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Spin size="small" />
          </div>
        ) : cars.length === 0 ? (
          <div className="text-center py-6">
            <Empty
              description={
                <span className="text-gray-500 text-xs">
                  Your vehicle information is not available yet.
                </span>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
            <Button
              type="primary"
              icon={<RiAddLine />}
              className="mt-3 text-xs bg-blue-600 hover:bg-blue-700 rounded-xl"
              onClick={() => navigate("/user/intro-cars")}
            >
              Add a new Vehicle
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cars.map((car) => {
              const Icon = getRandomCarIcon(car.ID || 0);
              return (
                <div
                  key={car.ID}
                  className="flex items-center justify-between rounded-xl border border-blue-100 bg-white px-3 py-2 shadow-sm active:scale-[0.98] transition"
                >
                  <div className="flex items-center gap-3">
                    {/* ✅ ไอคอนรถแบบสุ่ม */}
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 text-blue-600 text-lg">
                      <Icon />
                    </div>

                    {/* ✅ ข้อมูลรถ */}
                    <div className="flex-1 min-w-0">
                      <Paragraph className="!mb-0 text-sm font-semibold text-blue-800 truncate">
                        {car.Brand} {car.ModelCar}
                      </Paragraph>
                      <Text
                        type="secondary"
                        className="text-xs block text-gray-500"
                      >
                        register {car.LicensePlate} | {car.City}
                      </Text>
                      {car.SpecialNumber && (
                        <div className="mt-1 flex items-center gap-1 text-[12px] text-yellow-600 font-semibold">
                          <RiCheckboxCircleLine />
                          Special registration
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ✅ ปุ่มแก้ไข */}
                  <button
                    onClick={() => handleEdit(car)}
                    className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition"
                  >
                    <RiEdit2Line className="text-lg" />
                  </button>
                </div>
              );
            })}

            {/* ปุ่มเพิ่มรถใหม่ */}
            <div className="pt-2 flex justify-center">
              <Button
                type="primary"
                size="small"
                icon={<RiAddLine />}
                className="bg-blue-600 hover:bg-blue-700 rounded-xl"
                onClick={() => navigate("/user/intro-cars")}
              >
                Add a new Vehicle
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ✅ ใช้ EditCarModal */}
      <EditCarModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        car={editingCar}
        onUpdated={handleCarUpdated}
      />
    </>
  );
};

export default Cars;
