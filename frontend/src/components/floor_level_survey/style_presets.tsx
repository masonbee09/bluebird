import { LineStyle, PointStyle, TextStyle } from "./stylesheet"


const wallStyle = new LineStyle("#1f2937", 4)
const selectedWallStyle = new LineStyle("rgb(195, 22, 22)", 6)
const pointStyle = new PointStyle(4, "#1f2937")
const selectedPointStyle = new PointStyle(6, "rgb(195, 22, 22)")

const heightLabelStyle = new TextStyle({
    fontsize: 12, fontFamily: "Calibri", fill: "#1f2937",
    stroke: "#ffffff", strokeWidth: 3, draggable: true
})
const selectedHeightLabelStyle = new TextStyle({
    fontsize: 12, fontFamily: "Calibri", fill: "rgb(195, 22, 22)",
    stroke: "#ffffff", strokeWidth: 3, draggable: true
})

const heightLineStyle = new LineStyle("#1f2937", 2)


export { pointStyle, wallStyle, selectedPointStyle, selectedWallStyle, heightLabelStyle, heightLineStyle, selectedHeightLabelStyle }
