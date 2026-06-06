import { useState, useRef } from "react"
import * as XLSX from "xlsx"
import html2canvas from "html2canvas"

type Row = {
    w1?: number
    w2?: number
    w3?: number

    w1_g?: number
    w2_g?: number
    w3_g?: number

    w4_g?: number

    area_mm2?: number
    area_cm2?: number
    area_m2?: number

    cu_g_mm2?: number
    cu_g_cm2?: number
    cu_kg_m2?: number
}

type MapItem = {
    title: string
    unit: string
    values: number[]
    susColor: boolean
}

export default function App() {
    const [data, setData] = useState<Row[]>(
        Array.from({ length: 25 }, () => ({}))
    )

    const inputRefs = useRef<HTMLInputElement[][]>([])

    const [sampleName, setSampleName] = useState("")
    const [date, setDate] = useState("")

    const [weightUnit, setWeightUnit] = useState<"g" | "kg">("g")

    const [density, setDensity] = useState(7.9)
    const [densityUnit, setDensityUnit] = useState<"g/cm3" | "g/mm3" | "kg/m3">("g/cm3")

    const [thickness, setThickness] = useState(0.2)
    const [thicknessUnit, setThicknessUnit] = useState<"mm" | "cm" | "m">("mm")

    const [layout, setLayout] = useState<"row" | "col">("row")
    // --------------------
    // ページ切替
    // --------------------
    const [page, setPage] = useState<"main" | "electro">("main")

    // --------------------
    // 電解効率計算用
    // --------------------
    const [electroTimeValue, setElectroTimeValue] = useState(10)
    const [electroTimeUnit, setElectroTimeUnit] = useState<"s" | "m" | "h">("m")

    const [electroCurrentA, setElectroCurrentA] = useState(1)
    const [massBeforeG, setMassBeforeG] = useState(0)
    const [massAfterG, setMassAfterG] = useState(0)


    const [theoreticalDepositG, setTheoreticalDepositG] = useState<number | undefined>(undefined)
    const [actualDepositG, setActualDepositG] = useState<number | undefined>(undefined)
    const [electroEfficiency, setElectroEfficiency] = useState<number | undefined>(undefined)

    // --------------------
    // 単位変換
    // --------------------
    function weightToG(v?: number) {
        if (v == null || isNaN(v)) return undefined
        if (weightUnit === "kg") return v * 1000
        return v
    }

    function densityToGPerMm3() {
        if (densityUnit === "g/cm3") return density / 1000
        if (densityUnit === "g/mm3") return density
        if (densityUnit === "kg/m3") return density / 1_000_000
        return density / 1000
    }

    function thicknessToMm() {
        if (thicknessUnit === "mm") return thickness
        if (thicknessUnit === "cm") return thickness * 10
        if (thicknessUnit === "m") return thickness * 1000
        return thickness
    }
    function electroTimeToSec() {
        if (electroTimeUnit === "s") return electroTimeValue
        if (electroTimeUnit === "m") return electroTimeValue * 60
        if (electroTimeUnit === "h") return electroTimeValue * 3600
        return electroTimeValue
    }

    // --------------------
    // サンプル生成
    // --------------------
    function rand(min: number, max: number) {
        return Math.round((Math.random() * (max - min) + min) * 1000) / 1000
    }

    function sampleFill() {
        setWeightUnit("g")

        setData(
            Array.from({ length: 25 }, () => ({
                w1: rand(0.420, 0.470),
                w2: rand(0.390, 0.420),
                w3: rand(0.310, 0.325),
            }))
        )
    }

    // --------------------
    // 入力更新
    // --------------------
    function updateCell(index: number, key: keyof Row, value: string) {
        const next = [...data]
        const num = value === "" ? undefined : parseFloat(value)
        next[index] = { ...next[index], [key]: num }
        setData(next)
    }

    // --------------------
    // 計算
    // --------------------
    function calculate() {
        const d = densityToGPerMm3()
        const t = thicknessToMm()

        const errors: string[] = []

        if (!isFinite(d) || d <= 0) errors.push("密度が不正です")
        if (!isFinite(t) || t <= 0) errors.push("厚みが不正です")

        const next = data.map((r, i) => {
            const w1_g = weightToG(r.w1)
            const w2_g = weightToG(r.w2)
            const w3_g = weightToG(r.w3)

            if (w2_g == null || w3_g == null) {
                return { ...r, w1_g, w2_g, w3_g }
            }

            const w4_g = w2_g - w3_g

            if (w2_g < w3_g) errors.push(`No.${i + 1}: ②テープをはがした重量 < ③SUS板の重量`)
            if (w3_g === 0) errors.push(`No.${i + 1}: ③SUS板の重量が0です`)
            if (w4_g < 0) errors.push(`No.${i + 1}: ④銅の重量が負です`)

            const area_mm2 = (w3_g / d) / t
            const area_cm2 = area_mm2 / 100
            const area_m2 = area_mm2 / 1_000_000

            const cu_g_mm2 = w4_g / area_mm2
            const cu_g_cm2 = cu_g_mm2 * 100
            const cu_kg_m2 = cu_g_mm2 * 1000

            return {
                ...r,
                w1_g,
                w2_g,
                w3_g,
                w4_g,
                area_mm2,
                area_cm2,
                area_m2,
                cu_g_mm2,
                cu_g_cm2,
                cu_kg_m2,
            }
        })

        if (errors.length > 0) {
            alert(errors.join("\n"))
            return
        }

        setData(next)
    }
    // --------------------
    // 電解効率計算
    // --------------------
    // --------------------
    // 電解効率計算
    // --------------------
    function calculateElectroEfficiency() {
        const M_CU = 63.546 // 銅のモル質量 [g/mol]
        const ELECTRON_NUM = 2 // Cu2+ + 2e- → Cu
        const FARADAY = 96485 // ファラデー定数 [C/mol]

        const timeSec = electroTimeToSec()

        const errors: string[] = []

        if (!isFinite(electroTimeValue) || electroTimeValue <= 0) {
            errors.push("電解時間が不正です")
        }

        if (!isFinite(timeSec) || timeSec <= 0) {
            errors.push("秒換算後の電解時間が不正です")
        }

        if (!isFinite(electroCurrentA) || electroCurrentA <= 0) {
            errors.push("電流が不正です")
        }

        if (!isFinite(massBeforeG)) {
            errors.push("実験前の質量が不正です")
        }

        if (!isFinite(massAfterG)) {
            errors.push("実験後の質量が不正です")
        }

        if (massAfterG < massBeforeG) {
            errors.push("実験後の質量が実験前の質量より小さいです")
        }

        if (errors.length > 0) {
            alert(errors.join("\n"))
            return
        }

        const theoretical = (M_CU * electroCurrentA * timeSec) / (ELECTRON_NUM * FARADAY)
        const actual = massAfterG - massBeforeG
        const efficiency = theoretical === 0 ? 0 : (actual / theoretical) * 100

        setTheoreticalDepositG(theoretical)
        setActualDepositG(actual)
        setElectroEfficiency(efficiency)
    }

    // --------------------
    // 配置
    // --------------------
    function makeGrid(values: number[]) {
        const g: (number | undefined)[][] = Array.from({ length: 5 }, () =>
            Array(5).fill(undefined)
        )

        values.forEach((v, i) => {
            if (layout === "row") {
                g[Math.floor(i / 5)][i % 5] = v
            } else {
                g[i % 5][Math.floor(i / 5)] = v
            }
        })

        return g
    }

    // --------------------
    // 色
    // --------------------
    function getColor(v: number | undefined, values: number[], susColor: boolean) {
        if (v == null || isNaN(v)) return "#eeeeee"

        const valid = values.filter(x => !isNaN(x))
        if (valid.length === 0) return "#eeeeee"

        const min = Math.min(...valid)
        const max = Math.max(...valid)
        const avg = valid.reduce((a, b) => a + b, 0) / valid.length

        const copperLow = [255, 230, 200]
        const copperMid = [255, 160, 80]
        const copperHigh = [180, 80, 0]

        const susLow = [230, 230, 230]
        const susMid = [150, 150, 150]
        const susHigh = [80, 80, 80]

        const low = susColor ? susLow : copperLow
        const mid = susColor ? susMid : copperMid
        const high = susColor ? susHigh : copperHigh

        if (max === min) {
            return `rgb(${mid.join(",")})`
        }

        const lerp = (a: number, b: number, t: number) => a + (b - a) * t

        const mix = (c1: number[], c2: number[], t: number) => {
            const safeT = Math.max(0, Math.min(1, t))
            return [
                Math.round(lerp(c1[0], c2[0], safeT)),
                Math.round(lerp(c1[1], c2[1], safeT)),
                Math.round(lerp(c1[2], c2[2], safeT)),
            ]
        }

        let c: number[]

        if (v <= avg) {
            c = mix(low, mid, (v - min) / (avg - min || 1))
        } else {
            c = mix(mid, high, (v - avg) / (max - avg || 1))
        }

        return `rgb(${c.join(",")})`
    }

    // --------------------
    // PNG保存：余白対策
    // --------------------
    async function savePNG(id: string, fileName: string) {
        const el = document.getElementById(id)
        if (!el) return

        const rect = el.getBoundingClientRect()

        const canvas = await html2canvas(el, {
            backgroundColor: null,
            scale: 2,
            width: rect.width,
            height: rect.height,
            windowWidth: rect.width,
            windowHeight: rect.height,
            scrollX: 0,
            scrollY: 0,
        })

        const link = document.createElement("a")
        link.href = canvas.toDataURL("image/png")
        link.download = `${fileName}.png`
        link.click()
    }

    // --------------------
    // マップ定義：①〜④ + ⑤3種 + ⑥3種 = 合計10個
    // --------------------
    const mapList: MapItem[] = [
        {
            title: "① 全体の重量",
            unit: weightUnit,
            values: data.map(d => d.w1 ?? NaN),
            susColor: false,
        },
        {
            title: "② テープをはがした重量",
            unit: weightUnit,
            values: data.map(d => d.w2 ?? NaN),
            susColor: false,
        },
        {
            title: "③ SUS板の重量",
            unit: weightUnit,
            values: data.map(d => d.w3 ?? NaN),
            susColor: true,
        },
        {
            title: "④ 銅の重量",
            unit: "g",
            values: data.map(d => d.w4_g ?? NaN),
            susColor: false,
        },
        {
            title: "⑤ 面積",
            unit: "mm²",
            values: data.map(d => d.area_mm2 ?? NaN),
            susColor: true,
        },
        {
            title: "⑤ 面積",
            unit: "cm²",
            values: data.map(d => d.area_cm2 ?? NaN),
            susColor: true,
        },
        {
            title: "⑤ 面積",
            unit: "m²",
            values: data.map(d => d.area_m2 ?? NaN),
            susColor: true,
        },
        {
            title: "⑥ 単位面積当たりの銅の重量",
            unit: "g/mm²",
            values: data.map(d => d.cu_g_mm2 ?? NaN),
            susColor: false,
        },
        {
            title: "⑥ 単位面積当たりの銅の重量",
            unit: "g/cm²",
            values: data.map(d => d.cu_g_cm2 ?? NaN),
            susColor: false,
        },
        {
            title: "⑥ 単位面積当たりの銅の重量",
            unit: "kg/m²",
            values: data.map(d => d.cu_kg_m2 ?? NaN),
            susColor: false,
        },
    ]

    // --------------------
    // Excel出力
    // --------------------
    function exportExcel() {
        const wb = XLSX.utils.book_new()

        const wsInfo = XLSX.utils.aoa_to_sheet([
            ["試料名", sampleName],
            ["日付", date],
            ["重量入力単位", weightUnit],
            ["SUSの密度", density],
            ["密度単位", densityUnit],
            ["SUS板の厚み", thickness],
            ["厚み単位", thicknessUnit],
            ["並べ方", layout === "row" ? "横方向" : "縦方向"],
        ])

        const wsData = XLSX.utils.aoa_to_sheet([
            [
                "No",
                `① 全体の重量 [${weightUnit}]`,
                `② テープをはがした重量 [${weightUnit}]`,
                `③ SUS板の重量 [${weightUnit}]`,
                "④ 銅の重量 [g]",
                "⑤ 面積 [mm²]",
                "⑤ 面積 [cm²]",
                "⑤ 面積 [m²]",
                "⑥ 単位面積当たりの銅の重量 [g/mm²]",
                "⑥ 単位面積当たりの銅の重量 [g/cm²]",
                "⑥ 単位面積当たりの銅の重量 [kg/m²]",
            ],
            ...data.map((r, i) => [
                i + 1,
                r.w1,
                r.w2,
                r.w3,
                r.w4_g,
                r.area_mm2,
                r.area_cm2,
                r.area_m2,
                r.cu_g_mm2,
                r.cu_g_cm2,
                r.cu_kg_m2,
            ]),
        ])

        const wsMap = XLSX.utils.aoa_to_sheet([])

        mapList.forEach((m, idx) => {
            const startRow = Math.floor(idx / 2) * 8
            const startCol = (idx % 2) * 7

            XLSX.utils.sheet_add_aoa(wsMap, [[`${m.title} [${m.unit}]`]], {
                origin: { r: startRow, c: startCol },
            })

            XLSX.utils.sheet_add_aoa(wsMap, makeGrid(m.values), {
                origin: { r: startRow + 1, c: startCol },
            })
        })

        wsMap["!cols"] = Array(14).fill({ wpx: 55 })
        wsMap["!rows"] = Array(40).fill({ hpx: 55 })

        XLSX.utils.book_append_sheet(wb, wsInfo, "Info")
        XLSX.utils.book_append_sheet(wb, wsData, "Data")
        XLSX.utils.book_append_sheet(wb, wsMap, "Heatmap")

        const safeDate = date || "date"
        const safeSample = sampleName || "sample"
        XLSX.writeFile(wb, `${safeDate}_${safeSample}.xlsx`)
    }

return (
    <div
        style={{
            padding: 10,
            fontFamily: "Meiryo, sans-serif",
            boxSizing: "border-box",
        }}
    >
        <div
            style={{
                marginBottom: 24,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
            }}
        >
                <button
                onClick={() => setPage("main")}
                style={{
                    padding: "10px 18px",
                    fontSize: 16,
                    fontWeight: "bold",
                    borderRadius: 8,
                    border: page === "main" ? "2px solid #005bac" : "1px solid #999",
                    background: page === "main" ? "#005bac" : "#f5f5f5",
                    color: page === "main" ? "white" : "black",
                    cursor: "pointer",
                }}
            >
                銅重量ヒートマップ
            </button>

            <button
                onClick={() => setPage("electro")}
                style={{
                    padding: "10px 18px",
                    fontSize: 16,
                    fontWeight: "bold",
                    borderRadius: 8,
                    border: page === "electro" ? "2px solid #005bac" : "1px solid #999",
                    background: page === "electro" ? "#005bac" : "#f5f5f5",
                    color: page === "electro" ? "white" : "black",
                    cursor: "pointer",
                }}
            >
                電解効率計算
            </button>
        </div>

        {page === "main" && (
            <div
                style={{
                    textAlign: "center",
                    maxWidth: "100%",
                    margin: "0 auto",
                    padding: "0 8px",
                }}
            >

                <h2>条件入力</h2>

                <div
                    style={{
                        marginBottom: 8,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: "center",
                    }}
                >
                試料名：
                <input
                    value={sampleName}
                    onChange={e => setSampleName(e.target.value)}
                        style={{ width: "100%", maxWidth: 200 }}
                />

                日付：
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                />
            </div>

                <div
                    style={{
                        marginBottom: 8,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: "center",
                    }}
                >
                重量入力単位：
                <select
                    value={weightUnit}
                    onChange={e => setWeightUnit(e.target.value as "g" | "kg")}
                    style={{ marginRight: 12 }}
                >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                </select>

                SUSの密度：
                <input
                    type="number"
                    value={density}
                    onChange={e => setDensity(parseFloat(e.target.value))}
                    style={{ width: "100%", maxWidth: 120 }}
                />
                <select
                    value={densityUnit}
                    onChange={e => setDensityUnit(e.target.value as "g/cm3" | "g/mm3" | "kg/m3")}
                    style={{ marginRight: 12 }}
                >
                    <option value="g/cm3">g/cm³</option>
                    <option value="g/mm3">g/mm³</option>
                    <option value="kg/m3">kg/m³</option>
                </select>

                SUS板の厚み：
                <input
                    type="number"
                    value={thickness}
                    onChange={e => setThickness(parseFloat(e.target.value))}
                    style={{ width: "100%", maxWidth: 120 }}
                />
                <select
                    value={thicknessUnit}
                    onChange={e => setThicknessUnit(e.target.value as "mm" | "cm" | "m")}
                    style={{ marginRight: 12 }}
                >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                </select>
            </div>

            <div style={{ marginBottom: 8 }}>
                並べ方：
                <select
                    value={layout}
                    onChange={e => setLayout(e.target.value as "row" | "col")}
                    style={{ marginRight: 12 }}
                >
                    <option value="row">横方向</option>
                    <option value="col">縦方向</option>
                </select>

                <span style={{ display: "inline-block", whiteSpace: "pre", fontFamily: "monospace" }}>
                    {layout === "row"
                        ? "横方向: 1 2 3 4 5 / 6 7 8 9 10"
                        : "縦方向: 1 6 11 16 21 / 2 7 12 17 22"}
                </span>
            </div>

            <div style={{ marginBottom: 12 }}>
                <button onClick={sampleFill}>サンプル入力</button>
                <button onClick={calculate} style={{ marginLeft: 8 }}>計算</button>
                <button onClick={exportExcel} style={{ marginLeft: 8 }}>Excel出力</button>
            </div>

            <h2>数値入力</h2>

                <div style={{ overflowX: "auto" }}>
                    <table
                        border={1}
                        style={{
                            borderCollapse: "collapse",
                            margin: "0 auto 20px auto",
                            minWidth: 600,
                        }}
                    >
                <thead>
                    <tr>
                        <th style={{ padding: 4 }}>No</th>
                        <th style={{ padding: 4 }}>① 全体の重量 [{weightUnit}]</th>
                        <th style={{ padding: 4 }}>② テープをはがした重量 [{weightUnit}]</th>
                        <th style={{ padding: 4 }}>③ SUS板の重量 [{weightUnit}]</th>
                    </tr>
                </thead>

                <tbody>
                    {data.map((r, i) => (
                        <tr key={i}>
                            <td style={{ padding: 4, textAlign: "center" }}>{i + 1}</td>

                            {[0, 1, 2].map(col => {
                                const key = ["w1", "w2", "w3"][col] as keyof Row

                                return (
                                    <td
                                        key={col}
                                        style={{
                                            padding: 4,
                                            overflow: "hidden",
                                        }}
                                    >
                                        <input
                                            type="number"
                                            value={r[key] ?? ""}
                                            ref={el => {
                                                if (!inputRefs.current[i]) inputRefs.current[i] = []
                                                if (el) inputRefs.current[i][col] = el
                                            }}
                                            onChange={e => updateCell(i, key, e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault()
                                                    inputRefs.current[i + 1]?.[col]?.focus()
                                                }
                                            }}
                                            style={{
                                                width: "100%",
                                                minWidth: 0,
                                                boxSizing: "border-box",
                                            }}
                                        />
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>

                <h2>ヒートマップ</h2>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: 16,
                        justifyItems: "center",
                    }}
                >
                    {mapList.map((m, idx) => {
                    const g = makeGrid(m.values)

                    return (
                        <div
                            style={{
                                marginBottom: 24,
                                textAlign: "center",
                                width: "100%",
                            }}
                        >
                            <h3 style={{ marginBottom: 6 }}>
                                {m.title} [{m.unit}]
                            </h3>

                            <div
                                id={`map-${idx}`}
                                style={{
                                    display: "inline-grid",
                                    gridTemplateColumns: "repeat(5, 1fr)",
                                    gridTemplateRows: "repeat(5, 1fr)",
                                    width: "90vw",
                                    height: "90vw",
                                    maxWidth: 250,
                                    maxHeight: 250,
                                    overflow: "hidden",
                                    background: "transparent",
                                    lineHeight: 1,
                                }}
                            >
                                {g.flat().map((v, cellIndex) => (
                                    <div
                                        key={cellIndex}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            boxSizing: "border-box",
                                            border: "1px solid black",
                                            background: getColor(v, m.values, m.susColor),
                                            color: "black",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: "bold",
                                            fontSize: idx >= 4 ? 8 : 10,
                                            textAlign: "center",
                                            overflow: "hidden",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {v != null && !isNaN(v) ? v.toFixed(3) : ""}
                                    </div>
                                ))}
                            </div>

                            <br />

                            <button
                                onClick={() =>
                                    savePNG(
                                        `map-${idx}`,
                                        `${idx + 1}_${m.title.replace(/[\\/:*?"<>|]/g, "")}_${m.unit.replace(/[\\/:*?"<>|]/g, "")}`
                                    )
                                }
                            >
                                PNG保存
                            </button>
                        </div>
                    )
                })}
                    </div>
                </div>
            )}

        {page === "electro" && (
            <div
                style={{
                    textAlign: "center",
                    maxWidth: 900,
                    margin: "0 auto",
                }}
            >
                <h2>電解効率計算</h2>

                <div
                    style={{
                        marginBottom: 12,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: "center",
                    }}
                >
                    電解時間：
                    <input
                        type="number"
                        value={electroTimeValue}
                        onChange={e => setElectroTimeValue(parseFloat(e.target.value))}
                        style={{ width: 100, marginLeft: 8, marginRight: 4 }}
                    />

                    <select
                        value={electroTimeUnit}
                        onChange={e => setElectroTimeUnit(e.target.value as "s" | "m" | "h")}
                        style={{ marginRight: 12 }}
                    >
                        <option value="s">s</option>
                        <option value="m">m</option>
                        <option value="h">h</option>
                    </select>

                    <span>
                        内部計算時間：
                        {isFinite(electroTimeToSec()) ? electroTimeToSec().toFixed(3) : "-"} s
                    </span>
                </div>

                <div
                    style={{
                        marginBottom: 12,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: "center",
                    }}
                >
                    電流：
                    <input
                        type="number"
                        value={electroCurrentA}
                        onChange={e => setElectroCurrentA(parseFloat(e.target.value))}
                        style={{ width: 100, marginLeft: 8, marginRight: 4 }}
                    />
                    A
                </div>

                <div style={{ marginBottom: 12 }}>
                    実験前の質量：
                    <input
                        type="number"
                        value={massBeforeG}
                        onChange={e => setMassBeforeG(parseFloat(e.target.value))}
                        style={{ width: 120, marginLeft: 8, marginRight: 4 }}
                    />
                    g
                </div>

                <div style={{ marginBottom: 12 }}>
                    実験後の質量：
                    <input
                        type="number"
                        value={massAfterG}
                        onChange={e => setMassAfterG(parseFloat(e.target.value))}
                        style={{ width: 120, marginLeft: 8, marginRight: 4 }}
                    />
                    g
                </div>

                <button
                    onClick={calculateElectroEfficiency}
                    style={{
                        padding: "8px 16px",
                        fontSize: 15,
                        fontWeight: "bold",
                        cursor: "pointer",
                    }}
                >
                    電解効率を計算
                </button>

                <h2 style={{ marginTop: 24 }}>計算結果</h2>

                <table
                    border={1}
                    style={{
                        borderCollapse: "collapse",
                        margin: "0 auto 20px auto",
                        textAlign: "center",
}}>
                    <tbody>
                        <tr>
                            <th style={{ padding: 6 }}>理論析出量</th>
                            <td style={{ padding: 6 }}>
                                {theoreticalDepositG !== undefined
                                    ? `${theoreticalDepositG.toFixed(6)} g`
                                    : "-"}
                            </td>
                        </tr>

                        <tr>
                            <th style={{ padding: 6 }}>実際析出量</th>
                            <td style={{ padding: 6 }}>
                                {actualDepositG !== undefined
                                    ? `${actualDepositG.toFixed(6)} g`
                                    : "-"}
                            </td>
                        </tr>

                        <tr>
                            <th style={{ padding: 6 }}>電解効率</th>
                            <td style={{ padding: 6 }}>
                                {electroEfficiency !== undefined
                                    ? `${electroEfficiency.toFixed(4)} %`
                                    : "-"}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <h2 style={{ marginTop: 24 }}>途中計算</h2>

                <table
                    border={1}
                    style={{
                        borderCollapse: "collapse",
                        margin: "0 auto 20px auto",
                        textAlign: "center",
                    }}
                >
                    <tbody>
                        <tr>
                            <th style={{ padding: 6 }}>時間換算</th>
                            <td style={{ padding: 6 }}>
                                {electroTimeValue} {electroTimeUnit}
                                {" = "}
                                {isFinite(electroTimeToSec()) ? electroTimeToSec().toFixed(3) : "-"} s
                            </td>
                        </tr>

                        <tr>
                            <th style={{ padding: 6 }}>理論析出量</th>
                            <td style={{ padding: 6 }}>
                                m<sub>th</sub> = 63.546 × {electroCurrentA} ×{" "}
                                {isFinite(electroTimeToSec()) ? electroTimeToSec().toFixed(3) : "-"}
                                {" ÷ 2 ÷ 96485 = "}
                                {theoreticalDepositG !== undefined
                                    ? `${theoreticalDepositG.toFixed(6)} g`
                                    : "-"}
                            </td>
                        </tr>

                        <tr>
                            <th style={{ padding: 6 }}>実際析出量</th>
                            <td style={{ padding: 6 }}>
                                m<sub>actual</sub> = {massAfterG} − {massBeforeG}
                                {" = "}
                                {actualDepositG !== undefined
                                    ? `${actualDepositG.toFixed(6)} g`
                                    : "-"}
                            </td>
                        </tr>

                        <tr>
                            <th style={{ padding: 6 }}>電解効率</th>
                            <td style={{ padding: 6 }}>
                                η ={" "}
                                {actualDepositG !== undefined ? actualDepositG.toFixed(6) : "-"}
                                {" ÷ "}
                                {theoreticalDepositG !== undefined ? theoreticalDepositG.toFixed(6) : "-"}
                                {" × 100 = "}
                                {electroEfficiency !== undefined
                                    ? `${electroEfficiency.toFixed(4)} %`
                                    : "-"}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <h2 style={{ marginTop: 24 }}>使用式</h2>

                <div
                    style={{
                        border: "1px solid #999",
                        padding: 16,
                        width: "fit-content",
                        margin: "0 auto",
                        background: "#f9f9f9",
                        lineHeight: 2,
                        fontSize: 17,
                        textAlign: "center",
                    }}
                >
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                            理論析出量
                        </div>

                        <div>
                            m<sub>th</sub> =
                            <span
                                style={{
                                    display: "inline-block",
                                    textAlign: "center",
                                    marginLeft: 8,
                                    verticalAlign: "middle",
                                }}
                            >
                                <span
                                    style={{
                                        display: "block",
                                        borderBottom: "1px solid black",
                                        padding: "0 12px",
                                    }}
                                >
                                    M I t
                                </span>
                                <span style={{ display: "block", padding: "0 12px" }}>
                                    n F
                                </span>
                            </span>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                            実際析出量
                        </div>

                        <div>
                            m<sub>actual</sub> = m<sub>after</sub> − m<sub>before</sub>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                            電解効率
                        </div>

                        <div>
                            η =
                            <span
                                style={{
                                    display: "inline-block",
                                    textAlign: "center",
                                    marginLeft: 8,
                                    verticalAlign: "middle",
                                }}
                            >
                                <span
                                    style={{
                                        display: "block",
                                        borderBottom: "1px solid black",
                                        padding: "0 12px",
                                    }}
                                >
                                    m<sub>actual</sub>
                                </span>
                                <span style={{ display: "block", padding: "0 12px" }}>
                                    m<sub>th</sub>
                                </span>
                            </span>
                            × 100
                        </div>
                    </div>

                    <div
                        style={{
                            fontSize: 14,
                            borderTop: "1px solid #ccc",
                            paddingTop: 8,
                        }}
                    >
                        M = 63.546 g/mol, n = 2, F = 96485 C/mol, t = 秒換算後の電解時間
                    </div>
                </div>
            </div>
        )}
        </div>
    )
}