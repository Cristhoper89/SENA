const RECEIPT_API_URL = window.CabanaRoutes.apiBaseUrl;

function receiptMoney(value) {
	if (value === null || value === undefined || value === "") return "No disponible";
	const amount = Number(value ?? 0);
	if (!Number.isFinite(amount)) return "No disponible";
	return new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency: "COP",
		maximumFractionDigits: 0
	}).format(amount);
}

function receiptHeaders() {
	return {
		"Content-Type": "application/json",
		"Authorization": `Bearer ${localStorage.getItem("access_token") || ""}`
	};
}

async function receiptRequest(path) {
	const response = await fetch(`${RECEIPT_API_URL}${path}`, {headers: receiptHeaders()});
	const raw = await response.text();
	let data = null;
	if (raw) {
		try {
			data = JSON.parse(raw);
		} catch {
			data = raw;
		}
	}
	if (!response.ok) {
		const detail = typeof data === "object" && data !== null ? data.detail || data.message : data;
		throw new Error(typeof detail === "string" ? detail : "No fue posible cargar el comprobante.");
	}
	return data;
}

function receiptDate(value) {
	if (!value) return null;
	const raw = String(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		const [year, month, day] = raw.split("-");
		return {text: `${day}/${month}/${year}`, hasTime: false};
	}
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) return null;
	return {
		text: new Intl.DateTimeFormat("es-CO", {
			dateStyle: "short",
			timeStyle: "medium",
			timeZone: "America/Bogota"
		}).format(parsed),
		hasTime: true
	};
}

function addReceiptLimitation(message) {
	const item = document.createElement("li");
	item.textContent = message;
	document.getElementById("receiptLimitations").append(item);
}

function renderReceipt(report, companies, operator) {
	const company = Array.isArray(companies) ? companies[0] : null;
	const box = report.caja;
	const openedAt = receiptDate(box.fecha);
	const printedAt = new Intl.DateTimeFormat("es-CO", {
		dateStyle: "short",
		timeStyle: "medium",
		timeZone: "America/Bogota"
	}).format(new Date());
	const companyName = company && company.nombre ? company.nombre : null;
	const businessDetails = company
		? [company.NIT && `NIT: ${company.NIT}`, company.direccion, company.telefono, company.correo]
			.filter(Boolean)
			.join(" · ")
		: "";
	const operatorName = operator && (operator.nombre || operator.username || operator.email)
		? [operator.nombre || operator.username, operator.email].filter(Boolean).join(" · ")
		: null;

	document.getElementById("companyName").textContent = companyName || "Comprobante de cierre de caja";
	document.getElementById("companyDetails").textContent = businessDetails;
	document.getElementById("receiptCashId").textContent = String(box.id);
	document.getElementById("receiptOpenedAt").textContent = openedAt ? openedAt.text : "No disponible";
	document.getElementById("receiptPrintedAt").textContent = printedAt;
	document.getElementById("receiptOperator").textContent = operatorName || "No disponible";
	document.getElementById("receiptOpening").textContent = receiptMoney(box.balance_inicial);
	document.getElementById("receiptCashSales").textContent = receiptMoney(report.venta_efectivo);
	document.getElementById("receiptSales").textContent = receiptMoney(report.ventas);
	document.getElementById("receiptTips").textContent = receiptMoney(report.propinas);
	document.getElementById("receiptDomicilios").textContent = receiptMoney(report.domicilios);
	document.getElementById("receiptDiscounts").textContent = receiptMoney(report.descuentos);
	document.getElementById("receiptExpenses").textContent = receiptMoney(report.gastos);
	document.getElementById("receiptBalance").textContent = receiptMoney(report.balance_final);

	if (!company) addReceiptLimitation("No se encontró información de la empresa en la base de datos.");
	else {
		["nombre", "NIT", "direccion", "telefono", "correo"].forEach(field => {
			if (!company[field]) addReceiptLimitation(`No se pudo incluir ${field} de la empresa porque ese dato está vacío en su registro.`);
		});
	}
	if (!openedAt) addReceiptLimitation("No se pudo incluir la fecha de apertura porque la caja no tiene una fecha válida registrada.");
	else if (!openedAt.hasTime) addReceiptLimitation("La BD conserva solo la fecha de apertura, no la hora exacta.");
	if (report.domicilios === null) addReceiptLimitation("No se pudo determinar el total de domicilios: no hay movimientos asociados y caja no guarda ese subtotal.");
	if (report.descuentos === null) addReceiptLimitation("No se pudo determinar el total de descuentos: no hay movimientos asociados y caja no guarda ese subtotal.");
	addReceiptLimitation("No se pudo incluir la fecha y hora histórica del cierre: la tabla caja no guarda ese dato. La fecha de impresión no representa necesariamente la hora del cierre.");
	addReceiptLimitation("No se pudo identificar al usuario que realizó el cierre: la caja no guarda el usuario asociado. El usuario mostrado es quien genera este comprobante.");
	addReceiptLimitation("No se pudieron incluir las facturas inicial y final: la BD no registra una secuencia de facturas. El ID de movimiento no equivale a un número de factura.");
	addReceiptLimitation("No se pudo separar la propina entre efectivo y otros medios: solo se registra el total de propinas por movimiento.");
	addReceiptLimitation("No se pudo calcular un total de otros ingresos: la BD no los registra por separado de las ventas.");

	document.getElementById("receipt").hidden = false;
	document.getElementById("receiptStatus").hidden = true;
	document.getElementById("printReceipt").disabled = false;
}

async function loadReceipt() {
	if (!localStorage.getItem("access_token")) {
		window.CabanaRoutes.navigate("/");
		return;
	}
	const cajaId = new URLSearchParams(window.location.search).get("id");
	if (!cajaId || !/^\d+$/.test(cajaId)) {
		document.getElementById("receiptStatus").textContent = "El ID de caja no es válido.";
		return;
	}
	try {
		const [report, companies, operator] = await Promise.all([
			receiptRequest(`/cajas/${encodeURIComponent(cajaId)}/comprobante`),
			receiptRequest("/empresas/"),
			receiptRequest("/auth/me")
		]);
		renderReceipt(report, companies, operator);
	} catch (error) {
		document.getElementById("receiptStatus").textContent = error instanceof Error
			? error.message
			: "No fue posible cargar el comprobante.";
	}
}

document.getElementById("printReceipt").addEventListener("click", () => window.print());
loadReceipt();
