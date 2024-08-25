routerAdd(
    "POST",
    "/billing/:name",
    (c) => {
      try {
        let name = c.pathParam("name");
        const data = $apis.requestInfo(c).data;
        if (!data) {
          return c.json(400, { message: "No body available" });
        }
        if (!data.products || data.products.length < 1) {
          return c.json(400, {
            message: `Can't create an empty bill for ${name}. 'products' shouldn't be empty or null.`,
          });
        }
  
        const prodsCollection = $app.dao().findCollectionByNameOrId("prods");
        const billCollection = $app.dao().findCollectionByNameOrId("Bill");
  
        $app.dao().runInTransaction((txDao) => {
          // Crear y guardar el registro de la factura
          const billRecord = new Record(billCollection);
          billRecord.load(data); // Asume que el cuerpo contiene todos los datos necesarios
          txDao.saveRecord(billRecord);
  
          // Crear y guardar los registros de productos asociados
          data.products.forEach((prod) => {
            const productRecord = new Record(prodsCollection);
            productRecord.load({
              qty: prod.qty,
              rels: prod.comps, //Arreglo de relaciones con cada complemento asociado al producto
              associated_bill: billRecord.id,
            });
            txDao.saveRecord(productRecord);
          });
        });
  
        return c.json(200, {
          message: `Bill for ${name} created successfully`,
          billId: billRecord.id,
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
    return c.json(200, { message: "Ok" + (search ? ": " + search : "") });
  });