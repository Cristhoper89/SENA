const MOVIMIENTOS_API_URL = window.CabanaRoutes.apiBaseUrl;

let movimientos = [];
let gastos = [];
let productos = [];
let consumos = [];
let mesas = [];
let pagos = [];
let activeTab = "ventas";
let rango = "week";
let movimientoExpandido = null;
let movimientoPendiente = null;
let guardando = false;
let mensajeTimer = null;

const listaMovimientos = document.getElementById("movList");
const mensajeMovimientos = document.getElementById("movMessage");
const modalDesactivar = document.getElementById("desactivarModal");
const modalMetodoPago = document.getElementById("metodoPagoModal");
const textoDesactivar = document.getElementById("desactivarTexto");
const botonRefrescar = document.getElementById("btnRefrescar");
const botonConfirmar = document.getElementById("confirmarDesactivar");
const metodoPagoSelect = document.getElementById("metodoPagoSelect");
const pagoMixtoModal = document.getElementById("pagoMixtoModal");
const pagoMixtoMensaje = document.getElementById("pagoMixtoMensaje");
const metodoPagoError = document.getElementById("metodoPagoError");
const guardarMetodoPago = document.getElementById("guardarMetodoPago");
const pagosMixtosInputs = {
	Efectivo: document.getElementById("pagoMixtoModalEfectivo"),
	Transferencia: document.getElementById("pagoMixtoModalTransferencia"),
	Tarjeta: document.getElementById("pagoMixtoModalTarjeta")
};

const RANGOS = {
	today: "Hoy",
	week: "Esta semana",
	month: "Este mes"
};

function headersMovimientos() {
	return {
		"Content-Type": "application/json",
		"Authorization": `Bearer ${localStorage.getItem("access_token") || ""}`
	};
}

async function apiMovimientos(ruta, metodo = "GET", cuerpo = null) {
	const opciones = {method: metodo, headers: headersMovimientos()};
	if (cuerpo !== null) {
		opciones.body = JSON.stringify(cuerpo);
	}
	const response = await fetch(`${MOVIMIENTOS_API_URL}${ruta}`, opciones);
	if (response.status === 204) {
		return null;
	}
	const data = await response.json();
	if (!response.ok) {
		throw new Error(data.detail || "No fue posible completar la operación.");
	}
	return data;
}

// ======================================================
// AYUDA
// ======================================================

function valorNumero(value) {
	return Number(value ?? 0) || 0;
}

function money(value) {
	return new Intl.NumberFormat("es-CO", {
		style: "currency",
		currency: "COP",
		maximumFractionDigits: 0
	}).format(valorNumero(value));
}

function esc(texto) {
	return String(texto ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatearFechaHora(value) {
	if (!value) return "Sin fecha";
	const fecha = new Date(value);
	if (Number.isNaN(fecha.getTime())) return "Sin fecha";
	return fecha.toLocaleString("es-CO", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit"
	});
}

function fechaEnRango(value, rangoActivo) {
	if (!value) return true;

	const fecha = new Date(value);
	if (Number.isNaN(fecha.getTime())) return true;

	const ahora = new Date();
	const inicio = new Date(ahora);

	if (rangoActivo === "today") {
		inicio.setHours(0, 0, 0, 0);
		return fecha >= inicio;
	}

	if (rangoActivo === "week") {
		inicio.setDate(ahora.getDate() - 6);
		inicio.setHours(0, 0, 0, 0);
		return fecha >= inicio;
	}

	inicio.setMonth(ahora.getMonth() - 1);
	inicio.setHours(0, 0, 0, 0);
	return fecha >= inicio;
}

function cajaEstaAbierta(movimiento) {
	return String(movimiento?.caja_estado ?? "").trim().toLowerCase() === "abierta";
}

function puedeDesactivar(movimiento) {
	return movimiento.estado !== false && cajaEstaAbierta(movimiento);
}

function puedeCambiarMetodo(movimiento) {
	return movimiento.estado !== false && cajaEstaAbierta(movimiento);
}

function nombreProducto(idProducto) {
	const producto = productos.find(item => item.id === Number(idProducto));
	return producto?.nombre || `Producto ${idProducto ?? "N/A"}`;
}

// La barra se relaciona con el movimiento mediante la tabla puente "barra",
// la mesa normal lo hace con mesa.id_mov.
function origenMovimiento(movimiento) {
	const barra = mesas.find(mesa => mesa.tipo === "barra" && mesa.id === movimiento.id_mesa);
	if (barra) return {texto: barra.nombre || "Barra", tipo: "barra"};

	const mesa = mesas.find(item => item.id_mov === movimiento.id);
	if (mesa) return {texto: mesa.nombre || `Mesa ${mesa.id}`, tipo: "mesa"};

	return null;
}

function indiceConsumosPorMovimiento() {
	return consumos.reduce((acumulador, consumo) => {
		if (!consumo.id_mov) return acumulador;
		if (!acumulador[consumo.id_mov]) acumulador[consumo.id_mov] = [];
		acumulador[consumo.id_mov].push(consumo);
		return acumulador;
	}, {});
}

function movimientosFiltrados() {
	return movimientos.filter(movimiento => (
		valorNumero(movimiento.total) !== 0 && fechaEnRango(movimiento.fecha_hora ?? null, rango)
	));
}

function gastosFiltrados() {
	return gastos.filter(gasto => fechaEnRango(gasto.fecha_hora ?? null, rango));
}

function mostrarMensaje(texto, tipo = "") {
	clearTimeout(mensajeTimer);
	mensajeMovimientos.textContent = texto;
	mensajeMovimientos.className = `mov-message ${tipo}`;
	if (texto) {
		mensajeTimer = setTimeout(() => {
			mensajeMovimientos.textContent = "";
			mensajeMovimientos.className = "mov-message";
		}, 6000);
	}
}

// ======================================================
// RENDER
// ======================================================

function renderResumen() {
	const ventas = movimientosFiltrados();
	const totalIngresos = ventas
		.filter(movimiento => movimiento.estado !== false)
		.reduce((suma, movimiento) => suma + valorNumero(movimiento.total), 0);
	const totalGastos = gastosFiltrados()
		.reduce((suma, gasto) => suma + valorNumero(gasto.valor), 0);
	const balanceNeto = totalIngresos - totalGastos;

	document.getElementById("totalIngresos").textContent = money(totalIngresos);
	document.getElementById("totalGastos").textContent = money(totalGastos);

	const balance = document.getElementById("balanceNeto");
	balance.textContent = money(balanceNeto);
	balance.classList.toggle("is-negative", balanceNeto < 0);
}

function renderRango() {
	document.querySelectorAll("#movRange [data-range]").forEach(boton => {
		boton.classList.toggle("is-active", boton.dataset.range === rango);
	});
	document.getElementById("tabVentas").classList.toggle("is-active", activeTab === "ventas");
	document.getElementById("tabVentas").setAttribute("aria-selected", String(activeTab === "ventas"));
	document.getElementById("tabGastos").classList.toggle("is-active", activeTab === "gastos");
	document.getElementById("tabGastos").setAttribute("aria-selected", String(activeTab === "gastos"));
}

function detalleMovimiento(movimiento, lineas) {
	const subtotal = lineas.reduce((suma, linea) => suma + valorNumero(linea.subtotal), 0);

	const lineasHtml = lineas.length > 0
		? `<div class="mov-detail-lines">${lineas.map(linea => `
			<div class="mov-detail-line">
				<strong>${valorNumero(linea.cantidad) || 1} x ${esc(nombreProducto(linea.id_producto))}</strong>
				<span>${money(linea.subtotal)}</span>
				${linea.notas ? `<span class="mov-detail-notes">${esc(linea.notas)}</span>` : ""}
			</div>
		`).join("")}</div>`
		: `<p class="mov-detail-empty">Sin productos asociados.</p>`;

	const botonDesactivar = puedeDesactivar(movimiento)
		? `<button class="mov-detail-deactivate" type="button" data-accion="desactivar" data-id="${movimiento.id}">
			<i data-lucide="ban"></i>
			Desactivar movimiento
		</button>`
		: "";
	const botonCambiarMetodo = puedeCambiarMetodo(movimiento)
		? `<button class="mov-detail-payment" type="button" data-accion="cambiar-metodo" data-id="${movimiento.id}">
			<i data-lucide="wallet-cards"></i>
			Cambiar método de pago
		</button>`
		: "";

	return `
		<div class="mov-detail">
			${lineasHtml}
			<div class="mov-detail-totals">
				<div class="mov-detail-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
				<div class="mov-detail-row"><span>Propina</span><strong>${money(movimiento.propina)}</strong></div>
				<div class="mov-detail-row"><span>Domicilio</span><strong>${money(movimiento.domicilio)}</strong></div>
				<div class="mov-detail-row total"><span>Total general</span><strong>${money(movimiento.total)}</strong></div>
			</div>
			${botonCambiarMetodo}
			${botonDesactivar}
		</div>
	`;
}

function tarjetaMovimiento(movimiento, lineas) {
	const expandido = movimientoExpandido === movimiento.id;
	const anulado = movimiento.estado === false;
	const origen = origenMovimiento(movimiento);
	const cajaAbierta = cajaEstaAbierta(movimiento);

	return `
		<article class="mov-card ${expandido ? "is-expanded" : ""}">
			<button class="mov-card-head" type="button" data-accion="expandir" data-id="${movimiento.id}" aria-expanded="${expandido}">
				<span>
					<span class="mov-card-id"># ${movimiento.id}</span>
					<span class="mov-card-time">${esc(formatearFechaHora(movimiento.fecha_hora))}</span>
				</span>
				<span class="mov-card-total">${money(movimiento.total)}</span>
				<i class="mov-card-chevron" data-lucide="${expandido ? "chevron-up" : "chevron-down"}"></i>
			</button>
			<div class="mov-card-meta">
				<span class="mov-badge metodo">${esc(movimiento.metodo || "Efectivo")}</span>
				<span class="mov-badge estado ${anulado ? "anulado" : ""}">${anulado ? "Anulado" : "Completado"}</span>
				${origen ? `<span class="mov-badge origen"><i data-lucide="${origen.tipo === "barra" ? "wine" : "layout-grid"}"></i>${esc(origen.texto)}</span>` : ""}
				<span class="mov-badge caja ${cajaAbierta ? "abierta" : "cerrada"}">Caja ${movimiento.id_caja ?? "--"} · ${cajaAbierta ? "Abierta" : "Cerrada"}</span>
				<span class="mov-badge mesero">Mesero: ${movimiento.id_mesero ? esc(String(movimiento.id_mesero).slice(0, 8)) : "Sin asignar"}</span>
				${movimiento.id_cliente ? `<span class="mov-badge cliente">Cliente: ${esc(String(movimiento.id_cliente).slice(0, 8))}</span>` : ""}
			</div>
			${expandido ? detalleMovimiento(movimiento, lineas) : ""}
		</article>
	`;
}

function tarjetaGasto(gasto) {
	return `
		<article class="mov-gasto">
			<div class="mov-gasto-top">
				<strong>${esc(gasto.nombre)}</strong>
				<span class="mov-gasto-value">- ${money(gasto.valor)}</span>
			</div>
			<p class="mov-gasto-desc">${gasto.descripcion ? esc(gasto.descripcion) : "Sin descripción"}</p>
			<div class="mov-gasto-foot">
				<span class="mov-badge">${esc(formatearFechaHora(gasto.fecha_hora))}</span>
				<span class="mov-badge">${esc(gasto.categoria_nombre || `Cat. ${gasto.categoria ?? "--"}`)}</span>
				<span class="mov-badge">Caja: ${gasto.id_caja ?? "General"}</span>
			</div>
		</article>
	`;
}

function renderEstado(titulo, texto, boton = "") {
	return `
		<div class="mov-state">
			<h3>${esc(titulo)}</h3>
			${texto ? `<p>${esc(texto)}</p>` : ""}
			${boton}
		</div>
	`;
}

function renderLista() {
	const indice = indiceConsumosPorMovimiento();

	if (activeTab === "ventas") {
		const ventas = movimientosFiltrados();
		if (!ventas.length) {
			listaMovimientos.innerHTML = renderEstado("Sin ventas en este rango");
		} else {
			listaMovimientos.innerHTML = ventas
				.map(movimiento => tarjetaMovimiento(movimiento, indice[movimiento.id] || []))
				.join("");
		}
		return;
	}

	const listaGastos = gastosFiltrados();
	listaMovimientos.innerHTML = listaGastos.length
		? listaGastos.map(tarjetaGasto).join("")
		: renderEstado("Sin gastos en este rango");
}

function render() {
	renderRango();
	renderResumen();
	renderLista();
	lucide.createIcons();
}

function renderCargando() {
	listaMovimientos.innerHTML = renderEstado("Cargando historial...", "");
}

// ======================================================
// DATOS
// ======================================================

async function cargarDatos() {
	botonRefrescar.disabled = true;
	renderCargando();

	const [movimientosPeticion, gastosPeticion, productosPeticion, consumosPeticion, mesasPeticion, pagosPeticion] = await Promise.allSettled([
		apiMovimientos("/movimientos/"),
		apiMovimientos("/gastos/"),
		apiMovimientos("/productos/"),
		apiMovimientos("/mesasC/"),
		apiMovimientos("/mesas/"),
		apiMovimientos("/metodo_pagos/")
	]);

	movimientos = movimientosPeticion.status === "fulfilled" ? movimientosPeticion.value || [] : [];
	gastos = gastosPeticion.status === "fulfilled" ? gastosPeticion.value || [] : [];
	productos = (productosPeticion.status === "fulfilled" ? productosPeticion.value || [] : [])
		.filter(producto => producto && producto.id);
	consumos = consumosPeticion.status === "fulfilled" ? consumosPeticion.value || [] : [];
	mesas = mesasPeticion.status === "fulfilled" ? mesasPeticion.value || [] : [];
	pagos = pagosPeticion.status === "fulfilled" ? pagosPeticion.value || [] : [];

	const fallidas = [movimientosPeticion, gastosPeticion, productosPeticion, consumosPeticion, mesasPeticion, pagosPeticion]
		.filter(resultado => resultado.status === "rejected");

	render();

	botonRefrescar.disabled = false;
	if (fallidas.length) {
		mostrarMensaje(fallidas[0].reason?.message || "No se pudieron cargar los datos del historial.", "error");
	}
}

function actualizarEstadoMetodoPago() {
	const metodo = metodoPagoSelect.value;
	pagoMixtoModal.hidden = metodo !== "Mixto";
	if (metodo !== "Mixto") {
		pagoMixtoMensaje.textContent = "";
		guardarMetodoPago.disabled = guardando;
		return;
	}

	const pagosActuales = Object.entries(pagosMixtosInputs)
		.map(([tipo, input]) => ({metodo: tipo, valor: Math.round(valorNumero(input.value) * 100) / 100}))
		.filter(pago => pago.valor > 0);
	const suma = pagosActuales.reduce((total, pago) => total + pago.valor, 0);
	const totalMovimiento = valorNumero(movimientoPagoPendiente?.total);
	const coincide = Math.round(suma * 100) === Math.round(totalMovimiento * 100);
	const variosMetodos = pagosActuales.length >= 2;

	pagoMixtoMensaje.textContent = coincide && variosMetodos
		? `Desglose completo: ${money(suma)}`
		: `La suma debe ser ${money(totalMovimiento)} y usar al menos dos métodos.`;
	pagoMixtoMensaje.className = coincide && variosMetodos ? "valid" : "invalid";
	guardarMetodoPago.disabled = guardando || !coincide || !variosMetodos;
}

function abrirCambioMetodo(movimiento) {
	if (!puedeCambiarMetodo(movimiento)) return;

	movimientoPagoPendiente = movimiento;
	metodoPagoError.hidden = true;
	metodoPagoError.textContent = "";
	metodoPagoSelect.value = movimiento.metodo || "Efectivo";
	Object.values(pagosMixtosInputs).forEach(input => { input.value = 0; });

	const pagosMovimiento = pagos.filter(pago => Number(pago.movimiento_id) === Number(movimiento.id));
	if (metodoPagoSelect.value === "Mixto" && pagosMovimiento.length) {
		pagosMovimiento.forEach(pago => {
			const input = pagosMixtosInputs[pago.metodo];
			if (input) input.value = valorNumero(input.value) + valorNumero(pago.valor);
		});
	} else if (metodoPagoSelect.value === "Mixto" && valorNumero(movimiento.total) > 0) {
		pagosMixtosInputs.Efectivo.value = valorNumero(movimiento.total);
	}

	modalMetodoPago.hidden = false;
	actualizarEstadoMetodoPago();
	lucide.createIcons();
}

async function guardarCambioMetodo() {
	if (!movimientoPagoPendiente || !puedeCambiarMetodo(movimientoPagoPendiente)) {
		modalMetodoPago.hidden = true;
		return;
	}

	const metodo = metodoPagoSelect.value;
	const total = valorNumero(movimientoPagoPendiente.total);
	const detalles = metodo === "Mixto"
		? Object.entries(pagosMixtosInputs)
			.map(([tipo, input]) => ({metodo: tipo, valor: Math.round(valorNumero(input.value) * 100) / 100}))
			.filter(pago => pago.valor > 0)
		: (total > 0 ? [{metodo, valor: total}] : []);

	if (metodo === "Mixto" && (
		detalles.length < 2 ||
		Math.round(detalles.reduce((suma, pago) => suma + pago.valor, 0) * 100) !== Math.round(total * 100)
	)) {
		actualizarEstadoMetodoPago();
		return;
	}

	guardando = true;
	guardarMetodoPago.disabled = true;
	guardarMetodoPago.textContent = "Guardando...";
	try {
		await apiMovimientos(`/movimientos/${movimientoPagoPendiente.id}`, "PUT", {
			metodo,
			pagos: detalles
		});
		movimientos = movimientos.map(movimiento => (
			movimiento.id === movimientoPagoPendiente.id ? {...movimiento, metodo} : movimiento
		));
		pagos = pagos.filter(pago => Number(pago.movimiento_id) !== Number(movimientoPagoPendiente.id));
		pagos.push(...detalles.map(pago => ({
			movimiento_id: movimientoPagoPendiente.id,
			metodo: pago.metodo,
			valor: pago.valor
		})));
		modalMetodoPago.hidden = true;
		movimientoPagoPendiente = null;
		metodoPagoError.hidden = true;
		render();
		mostrarMensaje("Método de pago actualizado correctamente.", "success");
	} catch (error) {
		console.error(error);
		metodoPagoError.textContent = error.message || "No se pudo cambiar el método de pago.";
		metodoPagoError.hidden = false;
	} finally {
		guardando = false;
		guardarMetodoPago.disabled = false;
		guardarMetodoPago.textContent = "Guardar cambio";
		actualizarEstadoMetodoPago();
	}
}

async function desactivarMovimiento() {
	if (!movimientoPendiente) return;

	guardando = true;
	botonConfirmar.disabled = true;
	botonConfirmar.textContent = "Desactivando...";

	try {
		await apiMovimientos(`/movimientos/${movimientoPendiente.id}`, "PUT", {estado: false});
		movimientos = movimientos.map(movimiento => (
			movimiento.id === movimientoPendiente.id ? {...movimiento, estado: false} : movimiento
		));
		modalDesactivar.hidden = true;
		movimientoPendiente = null;
		render();
		mostrarMensaje("Movimiento desactivado correctamente.", "success");
	} catch (error) {
		console.error(error);
		mostrarMensaje(error.message || "No se pudo desactivar el movimiento.", "error");
	} finally {
		guardando = false;
		botonConfirmar.disabled = false;
		botonConfirmar.textContent = "Desactivar";
	}
}

// ======================================================
// EVENTOS
// ======================================================

document.getElementById("movRange").addEventListener("click", event => {
	const boton = event.target.closest("[data-range]");
	if (!boton) return;
	rango = boton.dataset.range;
	render();
});

document.getElementById("movList").addEventListener("click", event => {
	const boton = event.target.closest("[data-accion]");
	if (!boton) return;

	const accion = boton.dataset.accion;
	const id = Number(boton.dataset.id);

	if (accion === "expandir") {
		movimientoExpandido = movimientoExpandido === id ? null : id;
		render();
		return;
	}

	if (accion === "desactivar") {
		const movimiento = movimientos.find(item => item.id === id);
		if (!movimiento || !puedeDesactivar(movimiento)) return;
		movimientoPendiente = movimiento;
		textoDesactivar.textContent = `¿Está seguro de que desea desactivar el movimiento #${movimiento.id}?`;
		modalDesactivar.hidden = false;
		return;
	}

	if (accion === "cambiar-metodo") {
		const movimiento = movimientos.find(item => item.id === id);
		if (movimiento) abrirCambioMetodo(movimiento);
	}
});

metodoPagoSelect.addEventListener("change", () => {
	metodoPagoError.hidden = true;
	if (metodoPagoSelect.value === "Mixto" && Object.values(pagosMixtosInputs).every(input => valorNumero(input.value) === 0)) {
		pagosMixtosInputs.Efectivo.value = valorNumero(movimientoPagoPendiente?.total);
	}
	actualizarEstadoMetodoPago();
});
Object.values(pagosMixtosInputs).forEach(input => {
	input.addEventListener("input", () => {
		metodoPagoError.hidden = true;
		actualizarEstadoMetodoPago();
	});
});
guardarMetodoPago.addEventListener("click", () => {
	if (!guardando) guardarCambioMetodo();
});
document.getElementById("cancelarMetodoPago").addEventListener("click", () => {
	modalMetodoPago.hidden = true;
	movimientoPagoPendiente = null;
});
modalMetodoPago.addEventListener("click", event => {
	if (event.target === modalMetodoPago) {
		modalMetodoPago.hidden = true;
		movimientoPagoPendiente = null;
	}
});

document.querySelectorAll(".mov-tabs [data-tab]").forEach(boton => {
	boton.addEventListener("click", () => {
		activeTab = boton.dataset.tab;
		render();
	});
});

botonRefrescar.addEventListener("click", () => {
	mostrarMensaje("");
	cargarDatos();
});

document.getElementById("cancelarDesactivar").addEventListener("click", () => {
	modalDesactivar.hidden = true;
	movimientoPendiente = null;
});

botonConfirmar.addEventListener("click", () => {
	if (!guardando) desactivarMovimiento();
});

document.addEventListener("keydown", event => {
	if (event.key === "Escape" && !modalDesactivar.hidden) {
		modalDesactivar.hidden = true;
		movimientoPendiente = null;
	}
	if (event.key === "Escape" && !modalMetodoPago.hidden) {
		modalMetodoPago.hidden = true;
		movimientoPagoPendiente = null;
	}
});

if (!localStorage.getItem("access_token")) {
	window.CabanaRoutes.navigate("/");
} else {
	lucide.createIcons();
	cargarDatos();
}
