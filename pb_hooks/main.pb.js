routerAdd("GET", "/users", (c) => {
  return c.json(200, { message: "ok:" + $apis.requestInfo(c).query.roles });
});

routerAdd(
  "POST",
  "/billing",
  // "/billing/:name",
  (c) => {
    function createInvoiceRecord(data, invoiceCollection) {
      const invoiceRecord = new Record(invoiceCollection);
      invoiceRecord.load(data); // Cargar datos en el registro
      return invoiceRecord;
    }

    function createProductRecords(products, invoiceId, prodsCollection) {
      return products.map((prod) => {
        const productRecord = new Record(prodsCollection);
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

    try {
      const data = $apis.requestInfo(c).data;
      if (!data) {
        return c.json(400, { message: "No body available" });
      }
      if (!data.products || data.products.length < 1) {
        return c.json(400, {
          message: `Can't create an empty bill. 'products' shouldn't be empty or null.`,
        });
      }

      const prodsCollection = $app
        .dao()
        .findCollectionByNameOrId("ProductInvoice");
      const invoiceCollection = $app.dao().findCollectionByNameOrId("Invoice");

      let invoiceId = "";

      $app.dao().runInTransaction((txDao) => {
        // Crear y guardar el registro de la factura
        const invoiceRecord = createInvoiceRecord(data, invoiceCollection);
        txDao.saveRecord(invoiceRecord);
        invoiceId = invoiceRecord.id;

        // Crear y guardar los registros de productos asociados
        const productRecords = createProductRecords(
          data.products,
          invoiceId,
          prodsCollection
        );
        productRecords.forEach((productRecord) => {
          txDao.saveRecord(productRecord);
        });
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

routerAdd("POST", "billing/delivery", (c) => {
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
    //   const productRecord = new Record(prodsCollection);
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
