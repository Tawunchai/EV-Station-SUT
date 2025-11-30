// src/component/user/value/index.tsx  (หรือ path ของไฟล์ Value เดิมของคุณ)

import {
  Accordion,
  AccordionItem,
  AccordionItemHeading,
  AccordionItemButton,
  AccordionItemPanel,
  AccordionItemState,
} from "react-accessible-accordion";
import "react-accessible-accordion/dist/fancy-example.css";
import { MdOutlineArrowDropDown } from "react-icons/md";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ListGetStarted } from "../../../services";
import { GetstartedInterface } from "../../../interface/IGetstarted";
import Value1 from "../../../assets/picture/getStart_car_logo.jpg";
import defaultData from "../../../utils/accordion";

const Value = () => {
  const [rows, setRows] = useState<GetstartedInterface[]>([]);
  const [ready, setReady] = useState(false);

  const location = useLocation();

  // ใช้ key ผูกกับ path เพื่อบังคับให้ header re-mount เมื่อกลับมาหน้านี้
  const headerKey = useMemo(
    () => `value-header-${location.pathname}`,
    [location.pathname]
  );

  useEffect(() => {
    (async () => {
      const res = await ListGetStarted();
      setRows(Array.isArray(res) ? res : []);
      setReady(true);
    })();
  }, []);

  return (
    <section className="w-full">
      <div className="mx-auto max-w-screen-lg px-4 py-10">
        {/* Header */}
        <div className="mb-6 flex justify-center text-center">
          <div
            key={headerKey}
            className="inline-flex flex-col items-center text-center"
          >
            <h2 className="text-[22px] md:text-[24px] font-bold tracking-tight text-blue-900">
              Value We Give to You
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-blue-900/70">
              Ready to deliver a smooth & reliable EV experience.
            </p>
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-6">
          {/* รูปภาพ */}
          <div className="order-1">
            <div className="relative overflow-hidden rounded-2xl border border-blue-100 shadow-[0_8px_28px_rgba(37,99,235,0.06)]">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600" />
              <img
                src={Value1}
                alt="EV value"
                className="w-full object-cover h-[180px] md:h-full md:aspect-[4/3]"
                loading="lazy"
              />
            </div>
          </div>

          {/* Accordion */}
          <div className="order-2">
            {ready && (
              <div
                className={
                  rows.length > 3
                    ? "max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-transparent"
                    : ""
                }
              >
                <Accordion
                  allowMultipleExpanded={false}
                  allowZeroExpanded={false}
                  preExpanded={rows.length ? [String(rows[0].ID)] : []}
                  className="space-y-3"
                >
                  {rows.map((item, i) => (
                    <AccordionItem
                      key={item.ID}
                      uuid={String(item.ID)}
                      className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_8px_28px_rgba(37,99,235,0.06)]"
                    >
                      <AccordionItemHeading>
                        <AccordionItemButton
                          className="flex w-full items-center gap-3 px-4 py-3
                                     focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                        >
                          <AccordionItemState>
                            {({ expanded }) => (
                              <>
                                <span
                                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl
                                    ${
                                      expanded
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-blue-50 text-blue-500"
                                    }`}
                                >
                                  <span className="text-[18px]">
                                    {defaultData[i % defaultData.length].icon}
                                  </span>
                                </span>

                                <span className="flex-1 truncate text-[15px] font-semibold text-gray-900">
                                  {item.Title}
                                </span>

                                <span
                                  className={`text-blue-600 transition-transform duration-300
                                    ${expanded ? "rotate-180" : "rotate-0"}`}
                                >
                                  <MdOutlineArrowDropDown size={22} />
                                </span>
                              </>
                            )}
                          </AccordionItemState>
                        </AccordionItemButton>
                      </AccordionItemHeading>

                      <AccordionItemPanel className="px-4 pb-4 pt-0">
                        <div className="rounded-xl border border-blue-50 bg-blue-50/50 px-3 py-3">
                          <p className="text-[13px] leading-6 text-gray-700">
                            {item.Description}
                          </p>
                        </div>
                      </AccordionItemPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Value;
