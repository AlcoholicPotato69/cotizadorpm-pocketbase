migrate((app) => {
  const collection = app.findCollectionByNameOrId('clientes');
  if (collection) {
    let rule = collection.updateRule || '';
    if (!rule.includes('@request.auth.role = "verificador"')) {
      rule = rule.replace(
        '@request.auth.role = "admin"',
        '@request.auth.role = "admin" || @request.auth.role = "verificador"'
      );
      collection.updateRule = rule;
      app.save(collection);
    }
  }
});
