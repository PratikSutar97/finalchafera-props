import React, { useEffect, useMemo, useState } from "react";

import { createPortal } from "react-dom";

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
    Check,
    Pencil,
    LogIn,
    LogOut,
    Save,
    Users,
} from "lucide-react";

const META_REF = () => doc(db, "dramaPropsMeta", "main");

// Set VITE_ADMIN_PIN in your local .env file. This client-side PIN is a UI gate,

// not secure authorization for Firestore data.

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || "";

const adminIconStyle = {
    width: "32px",

    height: "32px",

    display: "inline-flex",

    alignItems: "center",

    justifyContent: "center",

    border: "1px solid #d7deea",

    borderRadius: "8px",

    background: "#fff",

    color: "#245be8",

    cursor: "pointer",

    flex: "0 0 auto",
};

function sortSections(list) {
    return [...list].sort((a, b) => {
        const am = a.id.match(/act(\d+)_pravesh(\d+)/i);

        const bm = b.id.match(/act(\d+)_pravesh(\d+)/i);

        if (am && bm) {
            return (
                Number(am[1]) - Number(bm[1]) || Number(am[2]) - Number(bm[2])
            );
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

    const [sceneEntryNameDraft, setSceneEntryNameDraft] = useState("");

    const [sceneEntryNameEditing, setSceneEntryNameEditing] = useState(false);

    const [sceneEntryNameSaving, setSceneEntryNameSaving] = useState(false);

    // Keep Admin Mode active across page refreshes in this browser.
    const [isAdmin, setIsAdmin] = useState(() => {
        try {
            return (
                window.localStorage.getItem("dramaPropsAdminLoggedIn") ===
                "true"
            );
        } catch {
            return false;
        }
    });

    const [loginOpen, setLoginOpen] = useState(false);

    const [adminPin, setAdminPin] = useState("");

    const [loginError, setLoginError] = useState("");

    const [editingPropId, setEditingPropId] = useState("");

    const [editingPropName, setEditingPropName] = useState("");
    const [activeVisitors, setActiveVisitors] = useState([]);
    const [visitorClock, setVisitorClock] = useState(Date.now());

    // Track one browser session without asking visitors to register or log in.
    useEffect(() => {
        if (!firebaseConfigured) return undefined;

        let visitorId = localStorage.getItem("dramaPropsVisitorId");
        if (!visitorId) {
            visitorId = window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            localStorage.setItem("dramaPropsVisitorId", visitorId);
        }

        const visitorRef = doc(db, "activeVisitors", visitorId);
        const heartbeat = async () => {
            try {
                await setDoc(
                    visitorRef,
                    {
                        visitorId,
                        device: getDeviceName(),
                        lastSeenAt: serverTimestamp(),
                    },
                    { merge: true },
                );
            } catch (e) {
                console.error("Visitor heartbeat failed:", e);
            }
        };

        heartbeat();
        const heartbeatInterval = window.setInterval(heartbeat, 30000);
        const handleVisibility = () => {
            if (document.visibilityState === "visible") heartbeat();
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            window.clearInterval(heartbeatInterval);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, []);

    // Only the admin browser subscribes to the visitor collection.
    useEffect(() => {
        if (!isAdmin || !firebaseConfigured) {
            setActiveVisitors([]);
            return undefined;
        }
        const unsubscribe = onSnapshot(
            collection(db, "activeVisitors"),
            (snapshot) =>
                setActiveVisitors(snapshot.docs.map((item) => item.data())),
            (e) => setError(`Live Visitors load error: ${e.message}`),
        );
        return unsubscribe;
    }, [isAdmin]);

    // Expire stale sessions even when Firestore sends no new snapshot.
    useEffect(() => {
        if (!isAdmin) return undefined;
        const timer = window.setInterval(
            () => setVisitorClock(Date.now()),
            15000,
        );
        return () => window.clearInterval(timer);
    }, [isAdmin]);

    const liveVisitorCount = useMemo(
        () =>
            activeVisitors.filter((visitor) => {
                const lastSeen = visitor.lastSeenAt?.toMillis?.() || 0;
                return lastSeen > 0 && visitorClock - lastSeen <= 90000;
            }).length,
        [activeVisitors, visitorClock],
    );

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
                        ...new Set(
                            sorted.map((s) => getAct(s.id)).filter(Boolean),
                        ),
                    ];

                    return acts.includes(current) ? current : acts[0] || 1;
                });

                setSelectedSection((current) =>
                    sorted.some((s) => s.id === current)
                        ? current
                        : sorted[0]?.id || "",
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
            [
                ...new Set(sections.map((s) => getAct(s.id)).filter(Boolean)),
            ].sort((a, b) => a - b),

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
                sectionData[currentSection?.id]?.items ||
                    currentSection?.items ||
                    {},
            ),

        [sectionData, currentSection],
    );

    const filteredItems = currentItems.filter(([, item]) =>
        String(item?.name || "")
            .toLowerCase()

            .includes(search.trim().toLowerCase()),
    );

    const checkedCount = currentItems.filter(
        ([, item]) => item?.checked,
    ).length;

    const progress = currentItems.length
        ? Math.round((checkedCount / currentItems.length) * 100)
        : 0;

    const savedSceneEntryName = String(
        sectionData[currentSection?.id]?.sceneEntryName || "",
    ).trim();

    useEffect(() => {
        setSceneEntryNameDraft(savedSceneEntryName);

        setSceneEntryNameEditing(!savedSceneEntryName);
    }, [currentSection?.id, savedSceneEntryName]);

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

    function isPropLockedForUser(sectionId, itemId) {
        const sourceSection = sections.find(
            (section) => section.id === sectionId,
        );
        const sourceItems =
            sectionData[sectionId]?.items || sourceSection?.items || {};
        const sourceItem = sourceItems[itemId];
        if (!sourceItem?.name) return true;

        const targetName = sourceItem.name.trim().toLocaleLowerCase();
        const matchingItems = sections.flatMap((section) => {
            const items = sectionData[section.id]?.items || section.items || {};
            return Object.values(items).filter(
                (item) => item?.name?.trim().toLocaleLowerCase() === targetName,
            );
        });

        // Never allow a checked occurrence without an assigned person.
        return !matchingItems.some(
            (item) => String(item.assignedTo || "").trim() !== "",
        );
    }

    async function toggleChecked(sectionId, itemId, checked) {
        setError("");

        try {
            const sourceSection = sections.find(
                (section) => section.id === sectionId,
            );
            const sourceItems =
                sectionData[sectionId]?.items || sourceSection?.items || {};
            const sourceItem = sourceItems[itemId];

            if (!sourceItem?.name) throw new Error("प्रॉप सापडला नाही.");

            const targetName = sourceItem.name.trim().toLocaleLowerCase();
            const matchingOccurrences = [];

            for (const section of sections) {
                const items =
                    sectionData[section.id]?.items || section.items || {};
                for (const [id, item] of Object.entries(items)) {
                    if (item?.name?.trim().toLocaleLowerCase() === targetName) {
                        matchingOccurrences.push({
                            sectionId: section.id,
                            itemId: id,
                        });
                    }
                }
            }

            const uniqueSectionIds = [
                ...new Set(matchingOccurrences.map((item) => item.sectionId)),
            ];

            if (
                !matchingOccurrences.length ||
                matchingOccurrences.length > 499
            ) {
                throw new Error("या प्रॉपच्या नोंदी अपडेट करता आल्या नाहीत.");
            }

            await runTransaction(db, async (tx) => {
                const snapshots = new Map();

                for (const id of uniqueSectionIds) {
                    const ref = doc(db, "dramaProps", id);
                    const snap = await tx.get(ref);
                    if (snap.exists())
                        snapshots.set(id, { ref, data: snap.data() });
                }

                const currentItems = matchingOccurrences
                    .map((occurrence) => {
                        const section = snapshots.get(occurrence.sectionId);
                        return section?.data.items?.[occurrence.itemId];
                    })
                    .filter(
                        (item) =>
                            item?.name?.trim().toLocaleLowerCase() ===
                            targetName,
                    );

                const assignedTo = String(
                    currentItems.find((item) =>
                        String(item.assignedTo || "").trim(),
                    )?.assignedTo || "",
                ).trim();

                if (checked && !assignedTo) {
                    throw new Error(
                        "Checkbox निवडण्यापूर्वी कोणाकडे आहे हे नाव लिहा.",
                    );
                }

                for (const occurrence of matchingOccurrences) {
                    const section = snapshots.get(occurrence.sectionId);
                    const currentItem =
                        section?.data.items?.[occurrence.itemId];

                    if (
                        !section ||
                        currentItem?.name?.trim().toLocaleLowerCase() !==
                            targetName
                    )
                        continue;

                    tx.update(section.ref, {
                        [`items.${occurrence.itemId}.checked`]: checked,
                        [`items.${occurrence.itemId}.assignedTo`]: assignedTo,
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
            // setError(`Checkbox update save झाला नाही: ${e.message}`);
        }
    }

    // An अंक is represented by its first प्रवेश document in the existing

    // dramaProps collection. This keeps the current Firestore data model intact.

    async function createAct() {
        setError("");

        try {
            const nextAct = Math.max(0, ...acts) + 1;

            const sectionId = `act${nextAct}_pravesh1`;

            const ref = doc(db, "dramaProps", sectionId);

            await runTransaction(db, async (tx) => {
                const existing = await tx.get(ref);

                if (existing.exists()) {
                    throw new Error(`अंक ${nextAct} आधीपासून अस्तित्वात आहे.`);
                }

                tx.set(ref, {
                    title: `अंक ${nextAct} - प्रवेश 1`,

                    act: nextAct,

                    pravesh: 1,

                    items: {},

                    createdAt: serverTimestamp(),

                    updatedAt: serverTimestamp(),
                });

                await updateMeta(tx);
            });

            setSelectedAct(nextAct);

            setSelectedSection(sectionId);

            setSearch("");

            setToast(`अंक ${nextAct} आणि प्रवेश 1 तयार झाला.`);
        } catch (e) {
            setError(`नवीन अंक तयार करता आला नाही: ${e.message}`);
        }
    }

    async function createEntry() {
        if (!acts.includes(selectedAct)) {
            setError("प्रवेश तयार करण्यापूर्वी नवीन अंक तयार करा.");

            return;
        }

        setError("");

        try {
            const existingEntries = sections

                .filter((section) => getAct(section.id) === selectedAct)

                .map((section) => getPravesh(section.id));

            const nextEntry = Math.max(0, ...existingEntries) + 1;

            const sectionId = `act${selectedAct}_pravesh${nextEntry}`;

            const ref = doc(db, "dramaProps", sectionId);

            await runTransaction(db, async (tx) => {
                const existing = await tx.get(ref);

                if (existing.exists()) {
                    throw new Error(
                        `प्रवेश ${nextEntry} आधीपासून अस्तित्वात आहे.`,
                    );
                }

                tx.set(ref, {
                    title: `अंक ${selectedAct} - प्रवेश ${nextEntry}`,

                    act: selectedAct,

                    pravesh: nextEntry,

                    items: {},

                    createdAt: serverTimestamp(),

                    updatedAt: serverTimestamp(),
                });

                await updateMeta(tx);
            });

            setSelectedSection(sectionId);

            setSearch("");

            setToast(`अंक ${selectedAct} मध्ये प्रवेश ${nextEntry} तयार झाला.`);
        } catch (e) {
            setError(`नवीन प्रवेश तयार करता आला नाही: ${e.message}`);
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

                    ...Object.values(items).map((item) =>
                        Number(item.order || 0),
                    ),
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

    async function updateSceneEntryName(sectionId, sceneEntryName) {
        setError("");

        try {
            const ref = doc(db, "dramaProps", sectionId);

            await runTransaction(db, async (tx) => {
                const snap = await tx.get(ref);

                if (!snap.exists()) {
                    throw new Error("अंक / प्रवेश सापडला नाही.");
                }

                tx.update(ref, {
                    sceneEntryName,

                    updatedAt: serverTimestamp(),
                });

                await updateMeta(tx);
            });

            return true;
        } catch (e) {
            console.error("Scene/entry name update failed:", e);

            setError(`अंक / प्रवेशाचे नाव save झाले नाही: ${e.message}`);

            return false;
        }
    }

    async function saveSceneEntryName() {
        if (!currentSection || sceneEntryNameSaving) return;

        const cleanName = sceneEntryNameDraft.trim();

        if (!cleanName) {
            setError("दृश्य / प्रवेशाचे नाव लिहा.");

            return;
        }

        setSceneEntryNameSaving(true);

        const saved = await updateSceneEntryName(currentSection.id, cleanName);

        setSceneEntryNameSaving(false);

        if (saved) {
            setSceneEntryNameDraft(cleanName);

            setSceneEntryNameEditing(false);

            setToast("दृश्य / प्रवेशाचे नाव save झाले.");
        }
    }

    async function updateAssignedTo(sectionId, itemId, assignedTo) {
        setError("");

        try {
            const sourceSection = sections.find(
                (section) => section.id === sectionId,
            );
            const sourceItems =
                sectionData[sectionId]?.items || sourceSection?.items || {};
            const sourceItem = sourceItems[itemId];

            if (!sourceItem?.name) throw new Error("प्रॉप सापडला नाही.");

            const targetName = sourceItem.name.trim().toLocaleLowerCase();
            const matchingOccurrences = [];

            for (const section of sections) {
                const items =
                    sectionData[section.id]?.items || section.items || {};
                for (const [id, item] of Object.entries(items)) {
                    if (item?.name?.trim().toLocaleLowerCase() === targetName) {
                        matchingOccurrences.push({
                            sectionId: section.id,
                            itemId: id,
                        });
                    }
                }
            }

            const uniqueSectionIds = [
                ...new Set(matchingOccurrences.map((item) => item.sectionId)),
            ];

            if (matchingOccurrences.length > 499) {
                throw new Error(
                    "या प्रॉपच्या खूप नोंदी आहेत. एकाच वेळी अपडेट करता येणार नाही.",
                );
            }

            await runTransaction(db, async (tx) => {
                const snapshots = new Map();

                for (const id of uniqueSectionIds) {
                    const ref = doc(db, "dramaProps", id);
                    const snap = await tx.get(ref);
                    if (snap.exists())
                        snapshots.set(id, { ref, data: snap.data() });
                }

                for (const occurrence of matchingOccurrences) {
                    const section = snapshots.get(occurrence.sectionId);
                    const currentItem =
                        section?.data.items?.[occurrence.itemId];

                    if (
                        !section ||
                        currentItem?.name?.trim().toLocaleLowerCase() !==
                            targetName
                    )
                        continue;

                    tx.update(section.ref, {
                        [`items.${occurrence.itemId}.assignedTo`]: assignedTo,
                        // Clearing the assignee also clears every matching checkbox.
                        ...(assignedTo
                            ? {}
                            : {
                                  [`items.${occurrence.itemId}.checked`]: false,
                              }),
                        updatedAt: serverTimestamp(),
                    });
                }

                await updateMeta(tx);
            });
        } catch (e) {
            console.error("Assigned person update failed:", e);
            setError(`प्रॉप कोणाकडे आहे हे save झाले नाही: ${e.message}`);
        }
    }

    async function updatePropName(sectionId, itemId, name) {
        const cleanName = name.trim();

        if (!cleanName) {
            setError("प्रॉपचे नाव रिकामे ठेवता येणार नाही.");

            return false;
        }

        setError("");

        try {
            const ref = doc(db, "dramaProps", sectionId);

            await runTransaction(db, async (tx) => {
                const snap = await tx.get(ref);

                if (!snap.exists() || !snap.data().items?.[itemId]) {
                    throw new Error("प्रॉप सापडला नाही.");
                }

                tx.update(ref, {
                    [`items.${itemId}.name`]: cleanName,

                    updatedAt: serverTimestamp(),
                });

                await updateMeta(tx);
            });

            setEditingPropId("");

            setEditingPropName("");

            setToast("प्रॉपचे नाव अपडेट झाले.");

            return true;
        } catch (e) {
            setError(`प्रॉपचे नाव अपडेट झाले नाही: ${e.message}`);

            return false;
        }
    }

    function submitAdminLogin(e) {
        e.preventDefault();

        const enteredPin = String(adminPin).trim();

        if (!/^[0-9]{4}$/.test(enteredPin)) {
            setLoginError("कृपया 4 अंकी code टाका.");

            return;
        }

        if (!ADMIN_PIN) {
            setLoginError("Admin PIN सेट केलेला नाही.");

            return;
        }

        if (enteredPin !== String(ADMIN_PIN).trim()) {
            setLoginError("चुकीचा code. पुन्हा प्रयत्न करा.");

            return;
        }

        setIsAdmin(true);
        try {
            window.localStorage.setItem("dramaPropsAdminLoggedIn", "true");
        } catch (storageError) {
            console.error("Could not persist Admin Mode:", storageError);
        }

        setLoginOpen(false);

        setAdminPin("");

        setLoginError("");

        setToast("Admin mode सुरू झाला.");
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

                    assignedTo: live.assignedTo || "",

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

                if (!trashSnap.exists())
                    throw new Error("Deleted prop सापडला नाही.");

                const deleted = trashSnap.data();

                const sectionRef = doc(
                    db,
                    "dramaProps",
                    deleted.originalSectionId,
                );

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

                        assignedTo: deleted.assignedTo || "",

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

            // OPTION 3: All props without duplicates.

            // If the same prop is assigned to different people in different entries,

            // retain all distinct assignee names in the consolidated PDF.

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
                            uniqueProps.set(normalizedName, {
                                name,

                                assignedTo: new Set(),
                            });
                        }

                        const assignedTo = String(
                            item?.assignedTo || "",
                        ).trim();

                        if (assignedTo) {
                            uniqueProps
                                .get(normalizedName)
                                .assignedTo.add(assignedTo);
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

                for (const prop of uniqueProps.values()) {
                    index++;

                    const people = [...prop.assignedTo].join(", ");

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

            <span style="min-width:0;">

              ${escapeText(prop.name)}

            </span>

            ${
                people
                    ? `<span style="margin-left:12px;color:#555;white-space:normal;">${escapeText(people)}</span>`
                    : ""
            }

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

                    const sectionDisplayTitle =
                        section.title || `प्रवेश ${getPravesh(section.id)}`;

                    const sceneEntryName = String(
                        sectionData[section.id]?.sceneEntryName || "",
                    ).trim();

                    html += `

          <h3 style="

            font-size:13px;

            margin:12px 0 6px;

            padding-bottom:4px;

            border-bottom:1px solid #333;

            break-after:avoid;

          ">

            ${escapeText(sectionDisplayTitle)}

            ${
                sceneEntryName
                    ? `<span style="margin-left:12px;font-size:11px;font-weight:normal;color:#555;">${escapeText(sceneEntryName)}</span>`
                    : ""
            }

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

              <span style="min-width:0;">

                ${escapeText(item?.name || "")}

              </span>

              ${
                  item?.assignedTo
                      ? `<span style="margin-left:14px;color:#555;min-width:0;white-space:normal;">${escapeText(item.assignedTo)}</span>`
                      : ""
              }

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
                    ? "अकत्रित_Props.pdf"
                    : "प्रवेश_परमाणे_props.pdf",

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

            const pixels = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            ).data;

            let nonWhitePixels = 0;

            for (let i = 0; i < pixels.length; i += 4) {
                if (
                    pixels[i] < 245 ||
                    pixels[i + 1] < 245 ||
                    pixels[i + 2] < 245
                ) {
                    nonWhitePixels++;

                    if (nonWhitePixels > 100) break;
                }
            }

            if (nonWhitePixels === 0) {
                throw new Error(
                    "HTML canvas पूर्ण पांढरा आहे. Browser content capture करत नाही.",
                );
            }

            const pdf = await html2pdf()
                .set(options)
                .from(canvas)
                .toPdf()
                .get("pdf");

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

            setError(
                `PDF तयार करताना error आला: ${e?.message || "Unknown error"}`,
            );
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
        <div
            className="page-shell"
            style={{
                width: "100%",
                maxWidth: "100vw",
                minWidth: 0,
                overflowX: "clip",
                boxSizing: "border-box",
            }}
        >
            <div className="container">
                <header className="page-header">
                    {/* <div className="eyebrow"><span className="eyebrow-dot" /> STAGE PRODUCTION CHECKLIST</div> */}

                    <div style={{ position: "relative", paddingRight: "44px" }}>
                        <h1>
                            फायनल चा फेरा <span>— प्रॉप्स</span>
                        </h1>

                        <button
                            type="button"
                            aria-label={
                                isAdmin ? "Admin logout" : "Admin login"
                            }
                            title={isAdmin ? "Admin logout" : "Admin login"}
                            onClick={() => {
                                if (isAdmin) {
                                    setIsAdmin(false);
                                    try {
                                        window.localStorage.removeItem(
                                            "dramaPropsAdminLoggedIn",
                                        );
                                    } catch (storageError) {
                                        console.error(
                                            "Could not clear Admin Mode:",
                                            storageError,
                                        );
                                    }

                                    setEditingPropId("");

                                    setToast("Admin mode बंद झाला.");
                                } else {
                                    setLoginOpen(true);

                                    setLoginError("");
                                }
                            }}
                            style={{
                                position: "absolute",

                                top: "0",

                                right: "0",

                                width: "36px",

                                height: "36px",

                                display: "inline-flex",

                                alignItems: "center",

                                justifyContent: "center",

                                border: "1px solid #d7deea",

                                borderRadius: "10px",

                                background: "#fff",

                                color: "#245be8",

                                cursor: "pointer",
                            }}
                        >
                            {isAdmin ? (
                                <LogOut size={18} />
                            ) : (
                                <LogIn size={18} />
                            )}
                        </button>
                    </div>

                    <div className="updated">
                        <span className="live-dot" />

                        {formatDate(lastUpdated)}

                        {lastUpdatedDevice && (
                            <span className="updated-device">
                                {" · " + lastUpdatedDevice.split(" · ").pop()}
                            </span>
                        )}
                    </div>
                </header>
                {isAdmin && (
                    <section
                        aria-label="Live Visitors"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            margin: "0 0 16px",
                            padding: "14px 16px",
                            border: "1px solid #dce5f1",
                            borderRadius: "14px",
                            background: "#fff",
                            boxShadow: "0 2px 8px rgba(20, 40, 70, 0.04)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                            }}
                        >
                            <Users size={21} color="#16a34a" />
                            <div>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        color: "#243047",
                                    }}
                                >
                                    Live Visitors
                                </div>
                                <div
                                    style={{
                                        fontSize: "12px",
                                        color: "#64748b",
                                    }}
                                >
                                    Active in the last 90 seconds
                                </div>
                            </div>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "#16a34a",
                                    boxShadow: "0 0 0 4px rgba(22,163,74,.12)",
                                }}
                            />
                            <strong
                                style={{
                                    fontSize: "28px",
                                    lineHeight: 1,
                                    color: "#15803d",
                                }}
                            >
                                {liveVisitorCount}
                            </strong>
                        </div>
                    </section>
                )}

                {error && (
                    <div className="alert error-alert">
                        <AlertTriangle size={18} />

                        <span>{error}</span>

                        <button
                            aria-label="Dismiss error"
                            onClick={() => setError("")}
                        >
                            <X size={17} />
                        </button>
                    </div>
                )}

                {toast && <div className="toast">{toast}</div>}

                <StructureManager
                    hasActs={acts.length > 0}
                    disabled={loading || !firebaseConfigured}
                    selectedAct={selectedAct}
                    onCreateAct={createAct}
                    onCreateEntry={createEntry}
                />

                <section className="tabs-card">
                    <div
                        className="act-tabs"
                        role="tablist"
                        aria-label="अंक निवडा"
                    >
                        {acts.map((act) => (
                            <button
                                key={act}
                                className={`act-tab ${selectedAct === act ? "active" : ""}`}
                                onClick={() => {
                                    setSelectedAct(act);

                                    const first = sections.find(
                                        (s) => getAct(s.id) === act,
                                    );

                                    if (first) setSelectedSection(first.id);
                                }}
                            >
                                अंक {act}
                            </button>
                        ))}

                        {!acts.length && (
                            <span className="muted empty-tabs">
                                अंक उपलब्ध नाहीत
                            </span>
                        )}
                    </div>

                    <div
                        className="entry-tabs"
                        role="tablist"
                        aria-label="प्रवेश निवडा"
                    >
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
                            <button
                                aria-label="शोध काढा"
                                onClick={() => setSearch("")}
                            >
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
                                    १. प्रवेश नुसारे props
                                </button>

                                <button
                                    onClick={() => downloadPdf(false, true)}
                                >
                                    २. अकत्रित Props
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="state-card">
                        <LoaderCircle className="spin" size={25} />

                        <strong>Props load होत आहेत...</strong>

                        {/* <span>Firestore शी connection होत आहे.</span> */}
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

                        <strong>
                            अजून कोणतेही अंक किंवा प्रवेश तयार केलेले नाहीत
                        </strong>

                        <span>
                            वरच्या “नवीन अंक तयार करा” बटणावर क्लिक करून सुरुवात
                            करा.
                        </span>
                    </div>
                ) : currentSection ? (
                    <section className="section-card">
                        <div className="section-heading">
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                                <span className="section-kicker">
                                    अंक {getAct(currentSection.id)} · प्रवेश{" "}
                                    {getPravesh(currentSection.id)}
                                </span>

                                <div className="section-title-row">
                                    <h2 style={{ margin: 0 }}>
                                        {currentSection.title}
                                    </h2>
                                </div>

                                <div
                                    className="scene-entry-name-row"
                                    style={{
                                        display: "flex",

                                        alignItems: "center",

                                        gap: "8px",

                                        width: "100%",

                                        minWidth: 0,

                                        marginTop: "8px",
                                    }}
                                >
                                    {sceneEntryNameEditing ? (
                                        <>
                                            <input
                                                key={`${currentSection.id}-scene-name`}
                                                type="text"
                                                aria-label="दृश्य / प्रवेशाचे नाव"
                                                value={sceneEntryNameDraft}
                                                onChange={(e) =>
                                                    setSceneEntryNameDraft(
                                                        e.target.value,
                                                    )
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();

                                                        saveSceneEntryName();
                                                    }
                                                }}
                                                placeholder="दृश्य / प्रवेशाचे नाव..."
                                                disabled={sceneEntryNameSaving}
                                                style={{
                                                    flex: "1 1 auto",

                                                    minWidth: 0,

                                                    maxWidth: "360px",

                                                    height: "38px",

                                                    padding: "7px 10px",

                                                    border: "1px solid #d7deea",

                                                    borderRadius: "9px",

                                                    background: "#fff",

                                                    color: "#243047",

                                                    font: "inherit",

                                                    fontSize: "13px",

                                                    boxSizing: "border-box",
                                                }}
                                            />

                                            <button
                                                type="button"
                                                aria-label="दृश्य / प्रवेशाचे नाव save करा"
                                                title="नाव save करा"
                                                onClick={saveSceneEntryName}
                                                disabled={
                                                    sceneEntryNameSaving ||
                                                    !sceneEntryNameDraft.trim()
                                                }
                                                style={{
                                                    flex: "0 0 36px",

                                                    width: "36px",

                                                    height: "36px",

                                                    display: "inline-flex",

                                                    alignItems: "center",

                                                    justifyContent: "center",

                                                    border: "1px solid #16a34a",

                                                    borderRadius: "9px",

                                                    background: "#16a34a",

                                                    color: "#fff",

                                                    cursor: sceneEntryNameSaving
                                                        ? "wait"
                                                        : "pointer",

                                                    opacity:
                                                        sceneEntryNameSaving ||
                                                        !sceneEntryNameDraft.trim()
                                                            ? 0.6
                                                            : 1,
                                                }}
                                            >
                                                {sceneEntryNameSaving ? (
                                                    <LoaderCircle
                                                        className="spin"
                                                        size={17}
                                                    />
                                                ) : (
                                                    <Check size={18} />
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span
                                                title={savedSceneEntryName}
                                                style={{
                                                    flex: "0 1 auto",

                                                    minWidth: 0,

                                                    maxWidth:
                                                        "calc(100% - 42px)",

                                                    whiteSpace: "normal",

                                                    overflowWrap: "anywhere",

                                                    color: "#52627a",

                                                    fontSize: "13px",

                                                    fontWeight: 600,
                                                }}
                                            >
                                                {savedSceneEntryName}
                                            </span>

                                            <button
                                                type="button"
                                                aria-label="दृश्य / प्रवेशाचे नाव edit करा"
                                                title="नाव edit करा"
                                                onClick={() => {
                                                    setSceneEntryNameDraft(
                                                        savedSceneEntryName,
                                                    );

                                                    setSceneEntryNameEditing(
                                                        true,
                                                    );
                                                }}
                                                style={{
                                                    flex: "0 0 34px",

                                                    width: "34px",

                                                    height: "34px",

                                                    display: "inline-flex",

                                                    alignItems: "center",

                                                    justifyContent: "center",

                                                    border: "1px solid #d7deea",

                                                    borderRadius: "9px",

                                                    background: "#fff",

                                                    color: "#245be8",

                                                    cursor: "pointer",
                                                }}
                                            >
                                                <Pencil size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="count-chip">
                                {checkedCount}
                                <span>/</span>
                                {currentItems.length} total
                            </div>
                        </div>

                        {/* <div className="progress-area">

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

            </div> */}

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
                                        <span
                                            className="checkbox-tooltip-wrap"
                                            title={
                                                isPropLockedForUser(
                                                    currentSection.id,
                                                    itemId,
                                                )
                                                    ? "आधी कोणाकडे आहे त्याचे नाव लिहा मग box चेक करा."
                                                    : ""
                                            }
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                position: "relative",
                                            }}
                                        >
                                            {isPropLockedForUser(
                                                currentSection.id,
                                                itemId,
                                            ) && (
                                                <button
                                                    type="button"
                                                    aria-label="व्यक्तीचे नाव आधी लिहा"
                                                    title="व्यक्तीचे नाव आधी लिहा"
                                                    onClick={() =>
                                                        window.alert(
                                                            "आधी कोणाकडे आहे त्याचे नाव लिहा मग box चेक करा",
                                                        )
                                                    }
                                                    style={{
                                                        position: "absolute",
                                                        inset: 0,
                                                        zIndex: 1,
                                                        width: "100%",
                                                        height: "100%",
                                                        padding: 0,
                                                        border: 0,
                                                        background:
                                                            "transparent",
                                                        cursor: "not-allowed",
                                                    }}
                                                />
                                            )}
                                            <input
                                                type="checkbox"
                                                checked={!!item.checked}
                                                disabled={isPropLockedForUser(
                                                    currentSection.id,
                                                    itemId,
                                                )}
                                                onChange={(e) => {
                                                    if (
                                                        e.target.checked &&
                                                        isPropLockedForUser(
                                                            currentSection.id,
                                                            itemId,
                                                        )
                                                    ) {
                                                        setToast(
                                                            "आधी कोणाकडे आहे त्याचे नाव लिहा मग box चेक करा.",
                                                        );
                                                        return;
                                                    }

                                                    toggleChecked(
                                                        currentSection.id,
                                                        itemId,
                                                        e.target.checked,
                                                    );
                                                }}
                                                aria-label={item.name}
                                            />
                                        </span>

                                        <span className="item-number">
                                            {index + 1}
                                        </span>

                                        {isAdmin && editingPropId === itemId ? (
                                            <input
                                                aria-label="प्रॉपचे नाव बदला"
                                                value={editingPropName}
                                                onChange={(e) =>
                                                    setEditingPropName(
                                                        e.target.value,
                                                    )
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();

                                                        updatePropName(
                                                            currentSection.id,
                                                            itemId,
                                                            editingPropName,
                                                        );
                                                    }

                                                    if (e.key === "Escape")
                                                        setEditingPropId("");
                                                }}
                                                style={{
                                                    flex: "1 1 auto",

                                                    minWidth: 0,

                                                    width: "100px",

                                                    padding: "7px 8px",

                                                    border: "1px solid #9bb5f7",

                                                    borderRadius: "8px",

                                                    font: "inherit",
                                                }}
                                            />
                                        ) : (
                                            <span className="item-name">
                                                {item.name}
                                            </span>
                                        )}

                                        {isAdmin && (
                                            <div
                                                style={{
                                                    display: "inline-flex",
                                                    gap: "4px",
                                                    flex: "0 0 auto",
                                                }}
                                            >
                                                {editingPropId === itemId ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            title="नाव save करा"
                                                            aria-label="नाव save करा"
                                                            onClick={() =>
                                                                updatePropName(
                                                                    currentSection.id,
                                                                    itemId,
                                                                    editingPropName,
                                                                )
                                                            }
                                                            style={
                                                                adminIconStyle
                                                            }
                                                        >
                                                            <Save size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            title="रद्द करा"
                                                            aria-label="रद्द करा"
                                                            onClick={() =>
                                                                setEditingPropId(
                                                                    "",
                                                                )
                                                            }
                                                            style={
                                                                adminIconStyle
                                                            }
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        title="प्रॉप edit करा"
                                                        aria-label="प्रॉप edit करा"
                                                        onClick={() => {
                                                            setEditingPropId(
                                                                itemId,
                                                            );

                                                            setEditingPropName(
                                                                item.name || "",
                                                            );
                                                        }}
                                                        style={adminIconStyle}
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    title="प्रॉप delete करा"
                                                    aria-label="प्रॉप delete करा"
                                                    onClick={() =>
                                                        deleteProp(
                                                            currentSection,
                                                            itemId,
                                                            item,
                                                        )
                                                    }
                                                    style={{
                                                        ...adminIconStyle,
                                                        color: "#dc2626",
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}

                                        <textarea
                                            key={`${itemId}-${item.assignedTo || ""}`}
                                            aria-label={`${item.name} कोणाकडे आहे`}
                                            title="हा प्रॉप कोणाकडे आहे?"
                                            rows={1}
                                            defaultValue={item.assignedTo || ""}
                                            placeholder="कोणाकडे आहे?"
                                            onBlur={(e) =>
                                                updateAssignedTo(
                                                    currentSection.id,

                                                    itemId,

                                                    e.target.value.trim(),
                                                )
                                            }
                                            style={{
                                                width: "min(220px, 32%)",

                                                minWidth: "120px",

                                                minHeight: "38px",

                                                marginLeft: "auto",

                                                padding: "8px 10px",

                                                border: "1px solid #d7deea",

                                                borderRadius: "9px",

                                                background: "#fff",

                                                color: "#243047",

                                                font: "inherit",

                                                fontSize: "14px",

                                                resize: "vertical",

                                                boxSizing: "border-box",
                                            }}
                                        />
                                    </div>
                                ))
                            )}
                        </div>

                        {isAdmin && (
                            <AddPropForm
                                key={currentSection.id}
                                onAdd={(name) =>
                                    addProp(currentSection.id, name)
                                }
                            />
                        )}
                    </section>
                ) : null}

                <footer>
                    फायनल चा फेरा · २०२६ <span>Props management workspace</span>
                </footer>
            </div>

            <button
                className="trash-fab"
                style={{
                    position: "fixed",
                    right: "max(16px, env(safe-area-inset-right))",
                    bottom: "max(16px, env(safe-area-inset-bottom))",
                    zIndex: 9999,
                }}
                title="Deleted Props / Trash"
                onClick={() => setTrashOpen(true)}
            >
                <Trash2 size={19} />

                <span>{trash.length}</span>
            </button>

            <button
                className="scroll-top"
                style={{
                    position: "fixed",
                    right: "max(16px, env(safe-area-inset-right))",
                    bottom: "max(104px, calc(env(safe-area-inset-bottom) + 88px))",
                    zIndex: 9999,
                }}
                title="वर जा"
                aria-label="वर जा"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
                <ArrowUp size={20} />
            </button>

            {loginOpen &&
                createPortal(
                    <div
                        className="admin-login-overlay"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget)
                                setLoginOpen(false);
                        }}
                        style={{
                            position: "fixed",

                            top: 0,

                            left: 0,

                            right: 0,

                            bottom: 0,

                            zIndex: 100000,

                            width: "100vw",

                            height: "100dvh",

                            maxWidth: "100vw",

                            display: "flex",

                            alignItems: "center",

                            justifyContent: "center",

                            padding: "16px",

                            paddingTop: "max(16px, env(safe-area-inset-top))",

                            paddingBottom:
                                "max(16px, env(safe-area-inset-bottom))",

                            boxSizing: "border-box",

                            overflowX: "hidden",

                            overflowY: "auto",

                            background: "rgba(20, 29, 48, 0.58)",

                            backdropFilter: "blur(5px)",

                            WebkitBackdropFilter: "blur(5px)",
                        }}
                    >
                        <section
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="admin-login-title"
                            style={{
                                width: "min(360px, calc(100vw - 32px))",

                                maxWidth: "100%",

                                minWidth: 0,

                                flex: "0 1 auto",

                                margin: "auto",

                                padding: "20px 16px",

                                borderRadius: "16px",

                                background: "#fff",

                                boxShadow: "0 20px 60px rgba(0,0,0,.2)",

                                boxSizing: "border-box",

                                overflowX: "hidden",

                                overflowY: "auto",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: "12px",
                                }}
                            >
                                <h2
                                    id="admin-login-title"
                                    style={{ margin: 0, fontSize: "19px" }}
                                >
                                    Admin Login
                                </h2>

                                <button
                                    type="button"
                                    aria-label="Close login"
                                    onClick={() => setLoginOpen(false)}
                                    style={adminIconStyle}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <form
                                onSubmit={submitAdminLogin}
                                style={{ marginTop: "18px" }}
                            >
                                <label
                                    htmlFor="admin-pin"
                                    style={{
                                        display: "block",
                                        marginBottom: "8px",
                                        color: "#52627a",
                                        fontSize: "13px",
                                    }}
                                >
                                    4 digit admin code
                                </label>

                                <input
                                    id="admin-pin"
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]{4}"
                                    maxLength={4}
                                    autoComplete="off"
                                    value={adminPin}
                                    onChange={(e) => {
                                        setAdminPin(
                                            e.target.value
                                                .replace(/\D/g, "")
                                                .slice(0, 4),
                                        );

                                        setLoginError("");
                                    }}
                                    placeholder="••••"
                                    autoFocus
                                    style={{
                                        display: "block",

                                        width: "100%",

                                        maxWidth: "100%",

                                        minWidth: 0,

                                        boxSizing: "border-box",

                                        padding: "12px",

                                        border: "1px solid #d7deea",

                                        borderRadius: "10px",

                                        fontSize: "20px",

                                        letterSpacing: "8px",

                                        textAlign: "center",
                                    }}
                                />

                                {loginError && (
                                    <p
                                        style={{
                                            color: "#dc2626",
                                            fontSize: "12px",
                                            margin: "8px 0 0",
                                        }}
                                    >
                                        {loginError}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={adminPin.length !== 4}
                                    style={{
                                        display: "block",

                                        width: "100%",

                                        maxWidth: "100%",

                                        minWidth: 0,

                                        boxSizing: "border-box",

                                        marginTop: "14px",

                                        padding: "11px",

                                        border: 0,

                                        borderRadius: "10px",

                                        background: "#245be8",

                                        color: "#fff",

                                        fontWeight: 700,

                                        cursor:
                                            adminPin.length === 4
                                                ? "pointer"
                                                : "not-allowed",

                                        opacity:
                                            adminPin.length === 4 ? 1 : 0.55,
                                    }}
                                >
                                    Login
                                </button>
                            </form>
                        </section>
                    </div>,

                    document.body,
                )}

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
                                <span className="section-kicker">
                                    RECOVERY CENTER
                                </span>

                                <h2>
                                    <Trash2 size={20} /> Deleted Props
                                </h2>
                            </div>

                            <div className="modal-actions">
                                <button
                                    className="backup-button"
                                    onClick={exportTrashBackup}
                                >
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
                                <div className="empty-state">
                                    Trash रिकामा आहे.
                                </div>
                            ) : (
                                trash.map((item) => (
                                    <div className="trash-row" key={item.id}>
                                        <div className="trash-info">
                                            <strong>{item.name}</strong>

                                            <span>
                                                {item.originalSectionTitle ||
                                                    item.originalSectionId}
                                            </span>

                                            <small>
                                                {formatDate(item.deletedAt)}
                                            </small>
                                        </div>

                                        <div className="trash-row-actions">
                                            <button
                                                className="restore-button"
                                                onClick={() =>
                                                    restoreProp(item)
                                                }
                                            >
                                                <RotateCcw size={15} /> Restore
                                            </button>

                                            <button
                                                className="permanent-delete-button"
                                                onClick={() =>
                                                    deletePermanently(item)
                                                }
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

function StructureManager({
    hasActs,

    disabled,

    selectedAct,

    onCreateAct,

    onCreateEntry,
}) {
    const [busy, setBusy] = useState("");

    async function run(action, callback) {
        if (busy) return;

        setBusy(action);

        try {
            await callback();
        } finally {
            setBusy("");
        }
    }
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
                Add
            </button>

            {localError && <p className="inline-error">{localError}</p>}
        </form>
    );
}
