routerAdd("GET", "/users", (c) => {
  return c.json(200, { message: "ok:" + $apis.requestInfo(c).query.roles });
});

routerAdd(
  "POST",
  "/billing/:type",
  // "/billing/:name",
  (c) => {
    function createInvoiceRecord(data, invoiceCollection) {
      const invoiceRecord = new Record(invoiceCollection);
      invoiceRecord.load(data); // Cargar datos en el registro
      return invoiceRecord;
    }

    function createProductRecords(products, invoiceId, prodInvoiceCollection) {
      return products.map((prod) => {
        const productRecord = new Record(prodInvoiceCollection);
        productRecord.load({
          base_product: prod.product,
          associated_invoice: invoiceId,
          complements: prod.complements,
          quantity: prod.quantity,
          composed_value: prod.composed_value,
        });
        return productRecord;
      });
    }

    const $ = $app.dao().findCollectionByNameOrId;

    const collections = {
      INVOICE: "Invoice",
      PINVOICE: "ProductInvoice",
      DELIVERY: "Delivery",
      CHECK: "Check",
    };
    const allowedTypes = {
      INVOICE: "Invoice",
      DELIVERY: "Delivery",
      CHECK: "Check",
    };

    const ROLES = {
      CASHIER: "Cashier",
      KIOSK: "Kiosk",
    };

    const STATUS = {
      OPEN: "Open",
      CLOSED: "Closed",
      PENDING: "Pending",
    };

    try {
      const type = c.pathParam("type");
      const data = $apis.requestInfo(c).data;
      const authRecord = c.get("authRecord");

      if (!data) return c.json(400, { message: "No body available" });
      if (!data.products || data.products.length < 1) {
        return c.json(400, {
          message: `Can't create an empty bill. 'products' shouldn't be empty or null.`,
        });
      }

      // if (!type || !Object.values(allowedTypes).includes(type))
      //   return c.json(422, { message: "Type unknown" });

      const prodInvoiceCollection = $(collections.PINVOICE);
      const invoiceCollection = $(collections.INVOICE);
      const deliveryCollection = $(collections.DELIVERY);
      // const checkCollection = $(collections.CHECK);

      let invoiceId = "";

      $app.dao().runInTransaction((txDao) => {
        console.log("handling auth record", JSON.stringify(authRecord));
        console.log(
          "handling roles",
          JSON.stringify(authRecord?.roles ?? "No roles in auth record")
        );
        const status = authRecord.roles?.includes(ROLES.CASHIER)
          ? STATUS.CLOSED
          : STATUS.OPEN;
        // Crear y guardar el registro de la factura - todo registro va asociado a una factura
        const invoiceRecord = createInvoiceRecord(
          { ...data, status },
          invoiceCollection
        );
        txDao.saveRecord(invoiceRecord);
        invoiceId = invoiceRecord.id;

        // Crear y guardar los registros de productos asociados para una factura o registro cerrado
        if (status === STATUS.CLOSED) {
          const productRecords = createProductRecords(
            data.products,
            invoiceId,
            prodInvoiceCollection
          );
          productRecords.forEach((productRecord) => {
            txDao.saveRecord(productRecord);
          });
        }

        let child_record = null;
        switch (type) {
          case allowedTypes.CHECK:
            console.log("handling a check");
            break;
          case allowedTypes.DELIVERY:
            console.log("handling a delivery");
            // const deliveryRecord = Record(deliveryCollection);
            child_record = Record(deliveryCollection);
            child_record.load({
              associated_invoice: invoiceId,
              products: data.products,
              ...data.delivery,
              // charge: 1000,
              // address: "data_address",
              // neighborhood: "data_neighborhood",
              // lat: 0,
              // lng: 0,
              // customer_name: "customer",
              // customer_phone: "phone",
            });
            break;
          case allowedTypes.INVOICE:
            console.log("handling a delivery");
            break;
        }
        // child_record.load(data);
        if (child_record !== null) txDao.saveRecord(child_record);
      });

      return c.json(200, {
        message: `Bill created successfully`,
        billId: invoiceId,
      });
    } catch (error) {
      console.error("Error processing billing request:", error);
      return c.json(500, {
        message: "Internal Server Error",
        error: error.message,
      });
    }
  },
  $apis.requireAdminOrRecordAuth()
);

routerAdd("POST", "billing2/delivery", (c) => {
  const data = $apis.requestInfo(c).data;

  // let type = c.pathParam("type");
  if (!data) {
    return c.json(400, { message: "No body available" });
  }
  if (!data.products || data.products.length < 1) {
    return c.json(400, {
      // message: `Can't create an empty bill for ${name}. 'products' shouldn't be empty or null.`,
      message: `Can't create an empty delivery. 'products' shouldn't be empty or null.`,
    });
  }
  const record = c.get("authRecord");
  console.log("auth:", JSON.stringify(record));
  console.log("data:", JSON.stringify(data));
  const invoiceCollection = $app.dao().findCollectionByNameOrId("Invoice");
  const deliveryCollection = $app.dao().findCollectionByNameOrId("Delivery");
  let invoiceId = "";

  $app.dao().runInTransaction((txDao) => {
    // Crear y guardar el registro de la factura
    const invoiceRecord = new Record(invoiceCollection);
    // invoiceRecord.load(data);
    invoiceRecord.load({
      ...data,
      status: record.roles?.includes("Register") ? "Closed" : "Open",
    }); // Asume que el cuerpo contiene todos los datos necesarios
    txDao.saveRecord(invoiceRecord);
    invoiceId = invoiceRecord.id;

    const deliveryRecord = Record(deliveryCollection);
    deliveryRecord.load({
      associated_invoice: invoiceId,
      products: data.products,
      charge: 1000,
      address: "data_address",
      neighborhood: "data_neighborhood",
      lat: 0,
      lng: 0,
      customer_name: "customer",
      customer_phone: "phone",
    });
    txDao.saveRecord(deliveryRecord);

    // Crear y guardar los registros de productos asociados
    // data.products.forEach((prod) => {
    //   const productRecord = new Record(prodInvoiceCollection);
    //   productRecord.load({
    //     base_product: prod.id,
    //     associated_invoice: invoiceId,
    //     complements: prod.comps, //Arreglo de relaciones con cada complemento asociado al producto
    //     quantity: prod.qty,
    //   });
    //   txDao.saveRecord(productRecord);
    // });
  });

  return c.json(200, { message: "Billing a delivery" });
});

// routerAdd("POST", "/mutate/:bill", (c) => {
//   return c.noContent(204);
//   let name = c.pathParam("bill");
//   const data = $apis.requestInfo(c).data;
//   console.log(JSON.stringify(data));
//   return c.json(200, { message: "Hello " + name });
// });

routerAdd("GET", "/status", (c) => {
  // let param = c.pathParam("message");
  const search = c.queryParam("message");
  return c.json(200, { message: "Ok" + (search ? ": " + search : "") });
});
