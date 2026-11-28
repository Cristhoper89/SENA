(function (global) {
	"use strict";

	const appRoutes = new Set([
		"index.html", "login", "login.html", "dashboard", "dashboard.html",
		"caja", "caja.html", "cajas", "cajas.html", "categorias", "categorias.html",
		"clientes", "clientes.html", "configuracion", "configuracion.html",
		"configuracion-mesas", "configuracion-mesas.html", "cierre-caja",
		"cierre-caja.html", "factura-cierre", "factura-cierre.html", "carta", "carta.html", "desbloquear", "desbloquear_cuenta.html",
		"gastos", "gastos.html", "ingredientes", "ingredientes.html", "mesas",
		"mesas.html", "movimientos", "movimientos.html", "olvido_contrasena",
		"olvido_contrasena.html", "olvido-contrasena", "opciones-productos", "opciones_productos.html",
		"pedidos", "pedidos.html", "perfil", "perfil.html", "productos",
		"productos.html", "recuperar", "reportes", "reportes.html", "usuarios",
		"usuarios.html", "static", "api"
	]);

	const firstSegment = global.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
	const basePath = firstSegment && !appRoutes.has(firstSegment) ? `/${firstSegment}` : "";

	function withBasePath(path) {
		const value = String(path || "/");
		if (!value.startsWith("/") || value.startsWith("//") || !basePath) return value;
		if (value === basePath || value.startsWith(`${basePath}/`) || value.startsWith(`${basePath}?`) || value.startsWith(`${basePath}#`)) {
			return value;
		}
		return `${basePath}${value}`;
	}

	function stripBasePath(path) {
		const value = String(path || "/");
		if (basePath && (value === basePath || value.startsWith(`${basePath}/`))) {
			return value.slice(basePath.length) || "/";
		}
		return value;
	}

	function navigate(path, replace = false) {
		const destination = withBasePath(path);
		if (replace) global.location.replace(destination);
		else global.location.assign(destination);
	}

	global.CabanaRoutes = {
		basePath,
		apiBaseUrl: `${global.location.origin}/api${basePath}`,
		withBasePath,
		stripBasePath,
		navigate
	};

	document.addEventListener("click", event => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
		if (!link || link.target || link.hasAttribute("download")) return;

		const destination = new URL(link.href, global.location.href);
		if (destination.origin !== global.location.origin || /^\/(?:api|static)(?:\/|$)/.test(destination.pathname)) return;

		const nextPath = withBasePath(`${destination.pathname}${destination.search}${destination.hash}`);
		if (nextPath === `${destination.pathname}${destination.search}${destination.hash}`) return;
		event.preventDefault();
		global.location.assign(nextPath);
	}, true);
})(window);
