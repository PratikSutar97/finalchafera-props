import React, { useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
import html2canvas from "html2canvas";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteField,
} from "firebase/firestore";
import { db, firebaseConfigured } from "./firebase.js";
import {
  Search,
  Download,
  Trash2,
  Plus,
  ArrowUp,
  X,
  RotateCcw,
  FileText,
  CheckSquare,
  Square,
  LoaderCircle,
  AlertTriangle,
} from "lucide-react";

const META_REF = () => doc(db, "dramaPropsMeta", "main");

function sortSections(list) {
  return [...list].sort((a, b) => {
    const am = a.id.match(/act(\d+)_pravesh(\d+)/i);
    const bm = b.id.match(/act(\d+)_pravesh(\d+)/i);

    if (am && bm) {
      return Number(am[1]) - Number(bm[1]) || Number(am[2]) - Number(bm[2]);
    }

    return a.id.localeCompare(b.id);
  });
}
function getAct(id) {
  return Number(id.match(/act(\d+)_/)?.[1] || 0);
}
function getPravesh(id) {
  return Number(id.match(/pravesh(\d+)/)?.[1] || 0);
}
function sortItems(items = {}) {
  return Object.entries(items).sort(
    (a, b) => Number(a[1]?.order || 0) - Number(b[1]?.order || 0),
  );
}
function formatDate(timestamp) {
  if (!timestamp) return "अजून अपडेट नाही";
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "अजून अपडेट नाही";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getDeviceName() {
  const ua = navigator.userAgent || "";
  const platform =
    navigator.userAgentData?.platform || navigator.platform || "";

  // Apple devices
  if (/iPhone/i.test(ua)) return "Apple iPhone";
  if (/iPad/i.test(ua)) return "Apple iPad";
  if (/Macintosh|Mac OS X/i.test(ua) || /Mac/i.test(platform)) {
    return "Apple Mac";
  }

  // Android manufacturers
  if (/Samsung|SM-[A-Z0-9]+/i.test(ua)) return "Samsung Device";
  if (/Redmi|POCO|Xiaomi|Miui/i.test(ua)) return "Xiaomi / Redmi Device";
  if (/vivo/i.test(ua)) return "Vivo Device";
  if (/OPPO|CPH[0-9]+/i.test(ua)) return "Oppo Device";
  if (/OnePlus/i.test(ua)) return "OnePlus Device";
  if (/Pixel/i.test(ua)) return "Google Pixel";
  if (/Realme/i.test(ua)) return "Realme Device";
  if (/Huawei/i.test(ua)) return "Huawei Device";
  if (/Motorola|Moto/i.test(ua)) return "Motorola Device";
  if (/Infinix/i.test(ua)) return "Infinix Device";
  if (/Tecno/i.test(ua)) return "Tecno Device";

  if (/Android/i.test(ua)) return "Android Device";

  // Computer operating systems
  if (/Windows/i.test(ua) || /Windows/i.test(platform)) {
    return "Windows PC / Laptop";
  }

  if (/Linux/i.test(ua) || /Linux/i.test(platform)) {
    return "Linux Computer";
  }

  return "Unknown Device";
}

function escapeText(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

export default function App() {
  const [sections, setSections] = useState([]);
  const [sectionData, setSectionData] = useState({});
  const [trash, setTrash] = useState([]);

  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastUpdatedDevice, setLastUpdatedDevice] = useState("");
  const [selectedAct, setSelectedAct] = useState(1);
  const [selectedSection, setSelectedSection] = useState("");
  const [search, setSearch] = useState("");
  const [pdfMenu, setPdfMenu] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      setError(
        "Firebase config सापडला नाही. .env.example ची .env.local प्रत तयार करून Firebase values भरा.",
      );
      return undefined;
    }
    const unsubSections = onSnapshot(
      collection(db, "dramaProps"),
      (snapshot) => {
        const next = [];
        const dataMap = {};
        snapshot.forEach((snap) => {
          const data = snap.data();
          const section = {
            id: snap.id,
            title: data.title || snap.id,
            items: data.items || {},
          };
          next.push(section);
          dataMap[snap.id] = data;
        });
        const sorted = sortSections(next);
        setSections(sorted);
        setSectionData(dataMap);
        setLoading(false);
        setError("");
        setSelectedAct((current) => {
          const acts = [
            ...new Set(sorted.map((s) => getAct(s.id)).filter(Boolean)),
          ];
          return acts.includes(current) ? current : acts[0] || 1;
        });
        setSelectedSection((current) =>
          sorted.some((s) => s.id === current) ? current : sorted[0]?.id || "",
        );
      },
      (e) => {
        setLoading(false);
        setError(`Firestore sections read error: ${e.message}`);
      },
    );

    const unsubMeta = onSnapshot(
      META_REF(),
      (snap) => {
        if (snap.exists()) {
          const meta = snap.data();
          setLastUpdated(meta.lastUpdatedAt || null);
          setLastUpdatedDevice(meta.lastUpdatedDevice || "");
        } else {
          setLastUpdated(null);
          setLastUpdatedDevice("");
        }
      },
      (e) => setError(`Last updated वाचताना error: ${e.message}`),
    );

    const unsubTrash = onSnapshot(
      collection(db, "dramaPropsTrash"),
      (snapshot) => {
        setTrash(
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const ad = a.deletedAt?.toMillis?.() || 0;
              const bd = b.deletedAt?.toMillis?.() || 0;
              return bd - ad;
            }),
        );
      },
      (e) => setError(`Trash data वाचताना error: ${e.message}`),
    );

    return () => {
      unsubSections();
      unsubMeta();
      unsubTrash();
    };
  }, []);

  const acts = useMemo(
    () =>
      [...new Set(sections.map((s) => getAct(s.id)).filter(Boolean))].sort(
        (a, b) => a - b,
      ),
    [sections],
  );
  const actSections = useMemo(
    () => sections.filter((s) => getAct(s.id) === selectedAct),
    [sections, selectedAct],
  );
  const currentSection =
    sections.find((s) => s.id === selectedSection) || actSections[0];
  const currentItems = useMemo(
    () =>
      sortItems(
        sectionData[currentSection?.id]?.items || currentSection?.items || {},
      ),
    [sectionData, currentSection],
  );
  const filteredItems = currentItems.filter(([, item]) =>
    String(item?.name || "")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const checkedCount = currentItems.filter(([, item]) => item?.checked).length;
  const progress = currentItems.length
    ? Math.round((checkedCount / currentItems.length) * 100)
    : 0;

  useEffect(() => {
    if (!search.trim()) return;
    const needle = search.trim().toLowerCase();
    const match = sections.find((section) =>
      sortItems(sectionData[section.id]?.items || section.items).some(
        ([, item]) =>
          String(item?.name || "")
            .toLowerCase()
            .includes(needle),
      ),
    );
    if (match) {
      setSelectedAct(getAct(match.id));
      setSelectedSection(match.id);
    }
  }, [search, sections, sectionData]);
  function getRegisteredDeviceName() {
    return getDeviceName();
  }

  async function updateMeta(transaction = null) {
    const metaData = {
      lastUpdatedAt: serverTimestamp(),
      lastUpdatedDevice: getRegisteredDeviceName(),
    };

    if (transaction) {
      transaction.set(META_REF(), metaData, { merge: true });
    } else {
      await setDoc(META_REF(), metaData, { merge: true });
    }
  }

  async function toggleChecked(sectionId, itemId, checked) {
    setError("");

    try {
      // Find the prop that was clicked.
      const sourceSection = sections.find(
        (section) => section.id === sectionId,
      );

      const sourceItems =
        sectionData[sectionId]?.items || sourceSection?.items || {};
      const sourceItem = sourceItems[itemId];

      if (!sourceItem?.name) {
        throw new Error("प्रॉप सापडला नाही.");
      }

      // Use the normalized name to match the same prop in every act and entry.
      const targetName = sourceItem.name.trim().toLocaleLowerCase();

      // Find every occurrence of this prop across all sections.
      const matchingOccurrences = [];

      for (const section of sections) {
        const items = sectionData[section.id]?.items || section.items || {};

        for (const [id, item] of Object.entries(items)) {
          if (
            item?.name &&
            item.name.trim().toLocaleLowerCase() === targetName
          ) {
            matchingOccurrences.push({
              sectionId: section.id,
              itemId: id,
            });
          }
        }
      }

      if (!matchingOccurrences.length) {
        throw new Error("या प्रॉपची दुसरी नोंद सापडली नाही.");
      }

      // Firestore transactions have a limit of 500 writes.
      // Keep this operation in one transaction for consistency.
      if (matchingOccurrences.length > 499) {
        throw new Error(
          "या प्रॉपच्या खूप नोंदी आहेत. एकाच वेळी अपडेट करता येणार नाही.",
        );
      }

      await runTransaction(db, async (tx) => {
        // Read all affected section documents before performing writes.
        const uniqueSectionIds = [
          ...new Set(matchingOccurrences.map((item) => item.sectionId)),
        ];

        const snapshots = new Map();

        for (const id of uniqueSectionIds) {
          const ref = doc(db, "dramaProps", id);
          const snap = await tx.get(ref);

          if (snap.exists()) {
            snapshots.set(id, { ref, data: snap.data() });
          }
        }

        // Update all matching prop occurrences.
        for (const occurrence of matchingOccurrences) {
          const section = snapshots.get(occurrence.sectionId);

          if (!section) continue;

          const currentItem = section.data.items?.[occurrence.itemId];

          // Ensure the prop still exists and still has the same name.
          if (currentItem?.name?.trim().toLocaleLowerCase() !== targetName) {
            continue;
          }

          tx.update(section.ref, {
            [`items.${occurrence.itemId}.checked`]: checked,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(
          META_REF(),
          { lastUpdatedAt: serverTimestamp() },
          { merge: true },
        );
      });
    } catch (e) {
      console.error("Checkbox update failed:", e);
      setError(`Checkbox update save झाला नाही: ${e.message}`);
    }
  }

  async function addProp(sectionId, name) {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "dramaProps", sectionId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Section सापडला नाही.");
      const items = snap.data().items || {};
      const nextOrder =
        Math.max(
          0,
          ...Object.values(items).map((item) => Number(item.order || 0)),
        ) + 1;
      tx.update(ref, {
        [`items.${id}`]: {
          name,
          checked: false,
          custom: true,
          order: nextOrder,
        },
        updatedAt: serverTimestamp(),
      });
      await updateMeta(tx);
    });
  }

  async function deleteProp(section, itemId, item) {
    if (
      !window.confirm(
        `"${item.name}" हा प्रॉप delete करायचा आहे का? तो Trash मध्ये जाईल.`,
      )
    )
      return;
    setError("");
    const trashId = `trash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await runTransaction(db, async (tx) => {
        const sectionRef = doc(db, "dramaProps", section.id);
        const snap = await tx.get(sectionRef);
        if (!snap.exists() || !snap.data().items?.[itemId])
          throw new Error("हा प्रॉप सापडला नाही.");
        const live = snap.data().items[itemId];
        tx.set(doc(db, "dramaPropsTrash", trashId), {
          originalSectionId: section.id,
          originalSectionTitle: section.title,
          originalItemId: itemId,
          name: live.name,
          checked: !!live.checked,
          custom: !!live.custom,
          order: Number(live.order || 0),
          deletedAt: serverTimestamp(),
        });
        tx.update(sectionRef, {
          [`items.${itemId}`]: deleteField(),
          updatedAt: serverTimestamp(),
        });
        await updateMeta(tx);
      });
      setToast("प्रॉप Trash मध्ये हलवला.");
    } catch (e) {
      setError(`प्रॉप Trash मध्ये हलवताना error: ${e.message}`);
    }
  }

  async function restoreProp(item) {
    try {
      await runTransaction(db, async (tx) => {
        const trashRef = doc(db, "dramaPropsTrash", item.id);
        const trashSnap = await tx.get(trashRef);
        if (!trashSnap.exists()) throw new Error("Deleted prop सापडला नाही.");
        const deleted = trashSnap.data();
        const sectionRef = doc(db, "dramaProps", deleted.originalSectionId);
        const sectionSnap = await tx.get(sectionRef);
        if (!sectionSnap.exists())
          throw new Error("मूळ अंक / प्रवेश सापडला नाही.");
        const items = sectionSnap.data().items || {};
        let restoreId = deleted.originalItemId;
        if (items[restoreId])
          restoreId = `restored_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        tx.update(sectionRef, {
          [`items.${restoreId}`]: {
            name: deleted.name,
            checked: !!deleted.checked,
            custom: !!deleted.custom,
            order: Number(deleted.order || 0),
          },
          updatedAt: serverTimestamp(),
        });
        tx.delete(trashRef);
        await updateMeta(tx);
      });
      setToast("प्रॉप restore केला.");
    } catch (e) {
      setError(`प्रॉप restore करताना error: ${e.message}`);
    }
  }
  async function deletePermanently(item) {
    const confirmed = window.confirm(
      `"${item.name}" हा प्रॉप Trash मधून कायमचा delete करायचा आहे का?\n\nही कृती पूर्ववत करता येणार नाही.`,
    );

    if (!confirmed) return;

    setError("");

    try {
      const trashRef = doc(db, "dramaPropsTrash", item.id);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(trashRef);

        if (!snap.exists()) {
          throw new Error("हा deleted prop आधीच delete झाला आहे.");
        }

        tx.delete(trashRef);
      });

      setToast("प्रॉप कायमचा delete केला.");
    } catch (e) {
      console.error("Permanent delete failed:", e);
      setError(`प्रॉप कायमचा delete करताना error: ${e.message}`);
    }
  }

  async function downloadPdf(checkedMode, uniqueMode = false) {
    if (!sections.length) {
      setError(
        "PDF तयार करण्यासाठी Firestore मधील props data load होणे आवश्यक आहे.",
      );
      return;
    }

    setPdfBusy(true);
    setPdfMenu(false);
    setError("");

    let source;

    try {
      const sortedSections = sortSections(sections);

      source = document.createElement("div");
      source.className = "pdf-export-root";

      source.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 794px;
      padding: 24px;
      box-sizing: border-box;
      background: #ffffff;
      color: #111827;
      visibility: visible;
      opacity: 1;
      display: block;
      min-height: 200px;
      overflow: visible;
      font-family: "Nirmala UI", "Noto Sans Devanagari", Mangal, Arial, sans-serif;
      z-index: 2147483647;
      pointer-events: none;
    `;

      let html = `
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="font-size:22px;margin:0 0 8px;">
          फायनल चा फेरा — प्रॉप्स
        </h1>
      </div>
    `;

      // OPTION 3: All props without duplicates
      if (uniqueMode) {
        const uniqueProps = new Map();

        for (const section of sortedSections) {
          const items = sortItems(
            sectionData[section.id]?.items || section.items || {},
          );

          for (const [, item] of items) {
            const name = String(item?.name || "")
              .replace(/\s+/g, " ")
              .trim();

            if (!name) continue;

            const normalizedName = name.toLocaleLowerCase();

            if (!uniqueProps.has(normalizedName)) {
              uniqueProps.set(normalizedName, name);
            }
          }
        }

        html += `
        <div style="
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          column-gap:12px;
          width:100%;
          font-size:10px;
        ">
      `;

        let index = 0;

        for (const name of uniqueProps.values()) {
          index++;

          html += `
          <div style="
            display:flex;
            align-items:flex-start;
            gap:4px;
            min-width:0;
            padding:5px 2px;
            border-bottom:1px solid #d1d5db;
            overflow-wrap:anywhere;
            break-inside:avoid;
          ">
            <span style="min-width:18px;color:#555;">
              ${index}.
            </span>
            <span style="flex:1;min-width:0;">
              ${escapeText(name)}
            </span>
          </div>
        `;
        }

        html += `</div>`;
      } else {
        // OPTION 1 and 2: Blank and checked checklists
        let activeAct = null;

        for (const section of sortedSections) {
          const act = getAct(section.id);

          if (act !== activeAct) {
            activeAct = act;

            html += `
            <div style="
              margin-top:18px;
              margin-bottom:10px;
              padding:8px;
              background:#e8eef7;
              border:1px solid #cbd5e1;
              break-after:avoid;
            ">
              <h2 style="font-size:18px;margin:0;">
                अंक ${act}
              </h2>
            </div>
          `;
          }

          html += `
          <h3 style="
            font-size:13px;
            margin:12px 0 6px;
            padding-bottom:4px;
            border-bottom:1px solid #333;
            break-after:avoid;
          ">
            ${escapeText(section.title || `प्रवेश ${getPravesh(section.id)}`)}
          </h3>
        `;

          const items = sortItems(
            sectionData[section.id]?.items || section.items || {},
          );

          if (!items.length) {
            html += `
            <p style="font-size:10px;color:#666;padding:5px 0;">
              या प्रवेशासाठी अजून प्रॉप्स नाहीत.
            </p>
          `;
            continue;
          }

          html += `
          <div style="
            display:grid;
            grid-template-columns:repeat(3,minmax(0,1fr));
            column-gap:10px;
            width:100%;
            margin-bottom:12px;
            font-size:10px;
          ">
        `;

          items.forEach(([, item], index) => {
            const isChecked = item?.checked === true;

            html += `
            <div style="
              display:flex;
              align-items:flex-start;
              gap:4px;
              min-width:0;
              padding:5px 2px;
              border-bottom:1px solid #d1d5db;
              overflow-wrap:anywhere;
              break-inside:avoid;
            ">
              <span style="min-width:16px;color:#555;">
                ${index + 1}.
              </span>

              ${
                checkedMode
                  ? `<span style="min-width:13px;font-size:12px;">
                      ${isChecked ? "☑" : "☐"}
                    </span>`
                  : ""
              }

              <span style="flex:1;min-width:0;">
                ${escapeText(item?.name || "")}
              </span>
            </div>
          `;
          });

          html += `</div>`;
        }
      }

      // Insert the generated HTML before attaching the element.
      source.innerHTML = html;
      document.body.appendChild(source);

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      if (!source.textContent?.trim()) {
        throw new Error(
          "PDF content रिकामे आहे. Props data load झाला आहे का ते तपासा.",
        );
      }

      const options = {
        margin: [6, 6, 6, 6],

        filename: uniqueMode
          ? "All_Props_Without_Duplicates.pdf"
          : "Props_Checklist_Blank.pdf",

        image: {
          type: "jpeg",
          quality: 0.98,
        },

        html2canvas: {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: true,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 1200,
        },

        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
          compress: true,
        },

        pagebreak: {
          mode: ["css", "legacy"],
          avoid: ["h2", "h3"],
        },
      };

      const canvas = await html2canvas(source, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: true,
        width: source.scrollWidth,
        height: source.scrollHeight,
        windowWidth: Math.max(window.innerWidth, source.scrollWidth),
        windowHeight: Math.max(window.innerHeight, source.scrollHeight),
        scrollX: 0,
        scrollY: 0,
      });

      if (!canvas || canvas.width < 10 || canvas.height < 10) {
        throw new Error("PDF साठी content capture झाले नाही.");
      }

      // Check that the captured canvas isn't entirely white.
      const ctx = canvas.getContext("2d");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let nonWhitePixels = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) {
          nonWhitePixels++;

          if (nonWhitePixels > 100) break;
        }
      }

      if (nonWhitePixels === 0) {
        throw new Error(
          "HTML canvas पूर्ण पांढरा आहे. Browser content capture करत नाही.",
        );
      }

      const pdf = await html2pdf().set(options).from(canvas).toPdf().get("pdf");

      if (!pdf || pdf.getNumberOfPages() < 1) {
        throw new Error("PDF तयार झाला नाही.");
      }

      const blob = pdf.output("blob");

      if (!blob || blob.size < 1000) {
        throw new Error("PDF रिकामा आहे. पुन्हा प्रयत्न करा.");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = options.filename;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 10000);

      setToast(
        uniqueMode
          ? "All Props — Without Duplicates PDF डाउनलोड सुरू झाला."
          : "Blank Checklist PDF डाउनलोड सुरू झाला.",
      );
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError(`PDF तयार करताना error आला: ${e?.message || "Unknown error"}`);
    } finally {
      source?.remove();
      setPdfBusy(false);
    }
  }

  function exportTrashBackup() {
    const backup = trash.map(({ id, ...item }) => ({
      ...item,
      deletedAt: item.deletedAt?.toDate?.().toISOString?.() || null,
    }));
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Props_Trash_Backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <div className="page-shell">
      <div className="container">
        <header className="page-header">
          {/* <div className="eyebrow"><span className="eyebrow-dot" /> STAGE PRODUCTION CHECKLIST</div> */}
          <h1>
            फायनल चा फेरा <span>— प्रॉप्स</span>
          </h1>

          <div className="updated">
            <span className="live-dot" />
            Last updated at — {formatDate(lastUpdated)}
            {lastUpdatedDevice && (
              <span className="updated-device"> · {lastUpdatedDevice}</span>
            )}
          </div>
        </header>

        {error && (
          <div className="alert error-alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}

        <section className="tabs-card">
          <div className="act-tabs" role="tablist" aria-label="अंक निवडा">
            {acts.map((act) => (
              <button
                key={act}
                className={`act-tab ${selectedAct === act ? "active" : ""}`}
                onClick={() => {
                  setSelectedAct(act);
                  const first = sections.find((s) => getAct(s.id) === act);
                  if (first) setSelectedSection(first.id);
                }}
              >
                अंक {act}
              </button>
            ))}
            {!acts.length && (
              <span className="muted empty-tabs">अंक उपलब्ध नाहीत</span>
            )}
          </div>
          <div className="entry-tabs" role="tablist" aria-label="प्रवेश निवडा">
            {actSections.map((section, index) => (
              <button
                key={section.id}
                className={`entry-tab ${selectedSection === section.id ? "active" : ""}`}
                onClick={() => setSelectedSection(section.id)}
              >
                प्रवेश {index + 1}
              </button>
            ))}
          </div>
        </section>

        <div className="toolbar">
          <label className="search-box">
            <Search size={19} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="प्रॉप शोधा..."
              autoComplete="off"
            />
            {search && (
              <button aria-label="शोध काढा" onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
          </label>
          <div className="pdf-wrap">
            <button
              className="pdf-button"
              disabled={pdfBusy || loading || !sections.length}
              onClick={() => setPdfMenu((v) => !v)}
            >
              {pdfBusy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Download size={18} />
              )}
              {pdfBusy ? "PDF तयार होत आहे..." : "PDF डाउनलोड"}
            </button>
            {pdfMenu && (
              <div className="pdf-menu">
                <button onClick={() => downloadPdf(false)}>
                  १.  प्रवेश नुसारे props 
                </button>
                <button onClick={() => downloadPdf(false, true)}>
                  २.  अकत्रित Props
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="state-card">
            <LoaderCircle className="spin" size={25} />
            <strong>Props load होत आहेत...</strong>
            <span>Firestore शी connection होत आहे.</span>
          </div>
        ) : !firebaseConfigured ? (
          <div className="state-card">
            <FileText size={28} />
            <strong>Firebase configuration आवश्यक आहे</strong>
            <span>README.md मधील setup steps पूर्ण करा.</span>
          </div>
        ) : !sections.length ? (
          <div className="state-card">
            <FileText size={28} />
            <strong>Firestore मध्ये sections सापडले नाहीत</strong>
            <span>
              dramaProps collection मध्ये act1_pravesh1 सारखी documents असावीत.
            </span>
          </div>
        ) : currentSection ? (
          <section className="section-card">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  अंक {getAct(currentSection.id)} · प्रवेश{" "}
                  {getPravesh(currentSection.id)}
                </span>
                <h2>{currentSection.title}</h2>
              </div>
              <div className="count-chip">
                {checkedCount}
                <span>/</span>
                {currentItems.length} पूर्ण
              </div>
            </div>
            <div className="progress-area">
              <div className="progress-label">
                <span>Checklist progress</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="items-list">
              {!filteredItems.length ? (
                <div className="empty-state">
                  {search
                    ? "या शोधासाठी प्रॉप सापडला नाही."
                    : "या प्रवेशासाठी अजून प्रॉप्स नाहीत."}
                </div>
              ) : (
                filteredItems.map(([itemId, item], index) => (
                  <div
                    className={`prop-row ${item.checked ? "is-checked" : ""}`}
                    key={itemId}
                  >
                    <input
                      type="checkbox"
                      checked={!!item.checked}
                      onChange={(e) =>
                        toggleChecked(
                          currentSection.id,
                          itemId,
                          e.target.checked,
                        )
                      }
                      aria-label={item.name}
                    />
                    <span className="item-number">{index + 1}</span>
                    <span className="item-name">{item.name}</span>
                    {item.custom && <span className="custom-tag">Custom</span>}
                    <button
                      className="delete-button"
                      title="हा प्रॉप delete करा"
                      aria-label={`${item.name} delete करा`}
                      onClick={() => deleteProp(currentSection, itemId, item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <AddPropForm
              key={currentSection.id}
              onAdd={(name) => addProp(currentSection.id, name)}
            />
          </section>
        ) : null}

        <footer>
          फायनल चा फेरा · २०२६ <span>Props management workspace</span>
        </footer>
      </div>

      <button
        className="trash-fab"
        title="Deleted Props / Trash"
        onClick={() => setTrashOpen(true)}
      >
        <Trash2 size={19} />
        <span>{trash.length}</span>
      </button>
      <button
        className="scroll-top"
        title="वर जा"
        aria-label="वर जा"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <ArrowUp size={20} />
      </button>

      {trashOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTrashOpen(false);
          }}
        >
          <section className="trash-modal">
            <div className="modal-header">
              <div>
                <span className="section-kicker">RECOVERY CENTER</span>
                <h2>
                  <Trash2 size={20} /> Deleted Props
                </h2>
              </div>
              <div className="modal-actions">
                <button className="backup-button" onClick={exportTrashBackup}>
                  <Download size={15} /> Backup
                </button>
                <button
                  className="icon-button"
                  aria-label="Close"
                  onClick={() => setTrashOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>
            </div>
            <div className="trash-content">
              {!trash.length ? (
                <div className="empty-state">Trash रिकामा आहे.</div>
              ) : (
                trash.map((item) => (
                  <div className="trash-row" key={item.id}>
                    <div className="trash-info">
                      <strong>{item.name}</strong>
                      <span>
                        {item.originalSectionTitle || item.originalSectionId}
                      </span>
                      <small>{formatDate(item.deletedAt)}</small>
                    </div>
                    <div className="trash-row-actions">
                      <button
                        className="restore-button"
                        onClick={() => restoreProp(item)}
                      >
                        <RotateCcw size={15} /> Restore
                      </button>

                      <button
                        className="permanent-delete-button"
                        onClick={() => deletePermanently(item)}
                        title="Delete permanently"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AddPropForm({ onAdd }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    setLocalError("");
    try {
      await onAdd(clean);
      setName("");
    } catch (error) {
      setLocalError(error.message || "प्रॉप save झाला नाही.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="add-area" onSubmit={submit}>
      <div className="add-input-wrap">
        <Plus size={18} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="या प्रवेशासाठी नवीन प्रॉप लिहा..."
          autoComplete="off"
        />
      </div>
      <button
        className="add-button"
        type="submit"
        disabled={busy || !name.trim()}
      >
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Plus size={17} />
        )}{" "}
        प्रॉप जोडा
      </button>
      {localError && <p className="inline-error">{localError}</p>}
    </form>
  );
}
