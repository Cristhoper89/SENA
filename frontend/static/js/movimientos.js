const MOVIMIENTOS_API_URL = window.CabanaRoutes.apiBaseUrl;

let movimientos = [];
let gastos = [];
let productos = [];
let mesas = [];
let activeTab = "ventas";
let rango = "week";
let paginaVentas = 1;
let paginaGastos = 1;
let tamanoPagina = 25;
let totalPaginasVentas = 1;
let totalPaginasGastos = 1;
let totalVentas = 0;
let totalGastos = 0;
let ingresosPeriodo = 0;
let gastosPeriodo = 0;
let detallesPorMovimiento = {};
const detallesCargando = new Set();
let catalogosCargados = false;
let solicitudHistorial = 0;
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
const inputFechaDesde = document.getElementById("fechaDesde");
const inputFechaHasta = document.getElementById("fechaHasta");
const paginacion = document.getElementById("movPagination");
const informacionPagina = document.getElementById("movPageInfo");
const botonPaginaAnterior = document.getElementById("movPagePrevious");
const botonPaginaSiguiente = document.getElementById("movPageNext");
const selectorTamanoPagina = document.getElementById("movPageSize");
const pagosMixtosInputs = {
	Efectivo: document.getElementById("pagoMixtoModalEfectivo"),
	Transferencia: document.getElementById("pagoMixtoModalTransferencia"),
	Tarjeta: document.getElementById("pagoMixtoModalTarjeta")
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
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	});
}

function fechaParaInput(fecha) {
	const anio = fecha.getFullYear();
	const mes = String(fecha.getMonth() + 1).padStart(2, "0");
	const dia = String(fecha.getDate()).padStart(2, "0");
	return `${anio}-${mes}-${dia}`;
}

function aplicarRango(rangoActivo) {
	rango = rangoActivo;
	if (rangoActivo === "all") {
		inputFechaDesde.value = "";
		inputFechaHasta.value = "";
		return;
	}

	const hoy = new Date();
	const inicio = new Date(hoy);
	inicio.setHours(0, 0, 0, 0);
	if (rangoActivo === "week") inicio.setDate(inicio.getDate() - 6);
	if (rangoActivo === "month") inicio.setMonth(inicio.getMonth() - 1);
	inputFechaDesde.value = fechaParaInput(inicio);
	inputFechaHasta.value = fechaParaInput(hoy);
}

function urlHistorial(endpoint, pagina) {
	const parametros = new URLSearchParams({
		page: String(pagina),
		page_size: String(tamanoPagina)
	});
	if (inputFechaDesde.value) parametros.set("fecha_desde", inputFechaDesde.value);
	if (inputFechaHasta.value) parametros.set("fecha_hasta", inputFechaHasta.value);
	return `${endpoint}?${parametros.toString()}`;
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

function movimientosFiltrados() {
	return movimientos.filter(movimiento => valorNumero(movimiento.total) !== 0);
}

function gastosFiltrados() {
	return gastos;
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
	const balanceNeto = ingresosPeriodo - gastosPeriodo;

	document.getElementById("totalIngresos").textContent = money(ingresosPeriodo);
	document.getElementById("totalGastos").textContent = money(gastosPeriodo);

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

function renderPaginacion() {
	const paginaActual = activeTab === "ventas" ? paginaVentas : paginaGastos;
	const totalActual = activeTab === "ventas" ? totalVentas : totalGastos;
	const totalPaginas = activeTab === "ventas" ? totalPaginasVentas : totalPaginasGastos;
	const inicio = totalActual === 0 ? 0 : (paginaActual - 1) * tamanoPagina + 1;
	const fin = Math.min(paginaActual * tamanoPagina, totalActual);

	paginacion.hidden = false;
	informacionPagina.textContent = `${inicio}-${fin} de ${totalActual} · Página ${paginaActual} de ${totalPaginas}`;
	botonPaginaAnterior.disabled = paginaActual <= 1;
	botonPaginaSiguiente.disabled = paginaActual >= totalPaginas;
	selectorTamanoPagina.value = String(tamanoPagina);
	selectorTamanoPagina.disabled = false;
}

function detalleMovimiento(movimiento) {
	const detalle = detallesPorMovimiento[movimiento.id];
	if (!detalle) {
		return `<div class="mov-detail"><p class="mov-detail-empty">${detallesCargando.has(movimiento.id) ? "Cargando detalle..." : "No se pudo cargar el detalle."}</p></div>`;
	}
	const lineas = detalle.consumos || [];
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

function tarjetaMovimiento(movimiento) {
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
			${expandido ? detalleMovimiento(movimiento) : ""}
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
	if (activeTab === "ventas") {
		const ventas = movimientosFiltrados();
		if (!ventas.length) {
			listaMovimientos.innerHTML = renderEstado("Sin ventas en este rango");
		} else {
			listaMovimientos.innerHTML = ventas
				.map(movimiento => tarjetaMovimiento(movimiento))
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
	renderPaginacion();
	renderLista();
	lucide.createIcons();
}

function renderCargando() {
	listaMovimientos.innerHTML = renderEstado("Cargando historial...", "");
	botonPaginaAnterior.disabled = true;
	botonPaginaSiguiente.disabled = true;
	selectorTamanoPagina.disabled = true;
}

// ======================================================
// DATOS
// ======================================================

async function cargarDetalleMovimiento(movimientoId) {
	if (detallesPorMovimiento[movimientoId]) return detallesPorMovimiento[movimientoId];
	if (detallesCargando.has(movimientoId)) return null;

	detallesCargando.add(movimientoId);
	if (movimientoExpandido === movimientoId) render();
	try {
		const detalle = await apiMovimientos(`/movimientos/${movimientoId}/detalle`);
		detallesPorMovimiento[movimientoId] = detalle;
		return detalle;
	} catch (error) {
		mostrarMensaje(error.message || "No se pudo cargar el detalle del movimiento.", "error");
		return null;
	} finally {
		detallesCargando.delete(movimientoId);
		if (movimientoExpandido === movimientoId) render();
	}
}

async function expandirMovimiento(movimientoId) {
	if (movimientoExpandido === movimientoId) {
		movimientoExpandido = null;
		render();
		return;
	}
	movimientoExpandido = movimientoId;
	if (detallesPorMovimiento[movimientoId]) {
		render();
	} else {
		await cargarDetalleMovimiento(movimientoId);
	}
}

async function cargarDatos() {
	const solicitudActual = ++solicitudHistorial;
	botonRefrescar.disabled = true;
	renderCargando();

	const [historial, catalogos] = await Promise.all([
		Promise.allSettled([
			apiMovimientos(urlHistorial("/movimientos/historial", paginaVentas)),
			apiMovimientos(urlHistorial("/gastos/historial", paginaGastos))
		]),
		catalogosCargados
			? Promise.resolve([])
			: Promise.allSettled([
				apiMovimientos("/productos/"),
				apiMovimientos("/mesas/")
			])
	]);
	if (solicitudActual !== solicitudHistorial) return;

	const [movimientosPeticion, gastosPeticion] = historial;
	movimientos = movimientosPeticion.status === "fulfilled" ? movimientosPeticion.value.items : [];
	gastos = gastosPeticion.status === "fulfilled" ? gastosPeticion.value.items : [];
	if (movimientosPeticion.status === "fulfilled") {
		totalVentas = movimientosPeticion.value.total;
		totalPaginasVentas = movimientosPeticion.value.total_pages;
		ingresosPeriodo = valorNumero(movimientosPeticion.value.total_ingresos);
	} else {
		totalVentas = 0;
		totalPaginasVentas = 1;
		ingresosPeriodo = 0;
	}
	if (gastosPeticion.status === "fulfilled") {
		totalGastos = gastosPeticion.value.total;
		totalPaginasGastos = gastosPeticion.value.total_pages;
		gastosPeriodo = valorNumero(gastosPeticion.value.total_gastos);
	} else {
		totalGastos = 0;
		totalPaginasGastos = 1;
		gastosPeriodo = 0;
	}

	if (catalogos.length) {
		const [productosPeticion, mesasPeticion] = catalogos;
		productos = productosPeticion.status === "fulfilled"
			? (productosPeticion.value || []).filter(producto => producto && producto.id)
			: [];
		mesas = mesasPeticion.status === "fulfilled" ? mesasPeticion.value || [] : [];
		catalogosCargados = catalogos.every(resultado => resultado.status === "fulfilled");
	}

	const fallidas = [movimientosPeticion, gastosPeticion, ...catalogos]
		.filter(resultado => resultado.status === "rejected");

	render();

	botonRefrescar.disabled = false;
	if (fallidas.length) {
		mostrarMensaje(fallidas[0].reason?.message || "No se pudieron cargar los datos del historial.", "error");
	} else {
		mostrarMensaje("");
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

async function abrirCambioMetodo(movimiento) {
	if (!puedeCambiarMetodo(movimiento)) return;
	const detalle = await cargarDetalleMovimiento(movimiento.id);
	if (!detalle) return;

	movimientoPagoPendiente = movimiento;
	metodoPagoError.hidden = true;
	metodoPagoError.textContent = "";
	metodoPagoSelect.value = movimiento.metodo || "Efectivo";
	Object.values(pagosMixtosInputs).forEach(input => { input.value = 0; });

	const pagosMovimiento = detalle.pagos || [];
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
		detallesPorMovimiento[movimientoPagoPendiente.id] = {
			...(detallesPorMovimiento[movimientoPagoPendiente.id] || {consumos: []}),
			pagos: detalles.map(pago => ({
				movimiento_id: movimientoPagoPendiente.id,
				metodo: pago.metodo,
				valor: pago.valor
			}))
		};
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
	aplicarRango(boton.dataset.range);
	paginaVentas = 1;
	paginaGastos = 1;
	movimientoExpandido = null;
	cargarDatos();
});

document.getElementById("btnFiltrarFechas").addEventListener("click", () => {
	if (inputFechaDesde.value && inputFechaHasta.value && inputFechaDesde.value > inputFechaHasta.value) {
		mostrarMensaje("La fecha inicial no puede ser posterior a la fecha final.", "error");
		return;
	}
	rango = "custom";
	paginaVentas = 1;
	paginaGastos = 1;
	movimientoExpandido = null;
	cargarDatos();
});

botonPaginaAnterior.addEventListener("click", () => {
	if (activeTab === "ventas" && paginaVentas > 1) paginaVentas -= 1;
	if (activeTab === "gastos" && paginaGastos > 1) paginaGastos -= 1;
	movimientoExpandido = null;
	cargarDatos();
});

botonPaginaSiguiente.addEventListener("click", () => {
	if (activeTab === "ventas" && paginaVentas < totalPaginasVentas) paginaVentas += 1;
	if (activeTab === "gastos" && paginaGastos < totalPaginasGastos) paginaGastos += 1;
	movimientoExpandido = null;
	cargarDatos();
});

selectorTamanoPagina.addEventListener("change", () => {
	tamanoPagina = Number(selectorTamanoPagina.value);
	paginaVentas = 1;
	paginaGastos = 1;
	movimientoExpandido = null;
	cargarDatos();
});

document.getElementById("movList").addEventListener("click", event => {
	const boton = event.target.closest("[data-accion]");
	if (!boton) return;

	const accion = boton.dataset.accion;
	const id = Number(boton.dataset.id);

	if (accion === "expandir") {
		expandirMovimiento(id);
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
	aplicarRango(rango);
	lucide.createIcons();
	cargarDatos();
}
