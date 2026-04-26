migrate((app) => {
  const collections = ['clientes', 'clientes_dictamenes', 'documentos', 'cotizaciones', 'espacios'];

  collections.forEach(name => {
    const collection = app.findCollectionByNameOrId(name);
    if (!collection) return;

    ['createRule', 'updateRule', 'deleteRule'].forEach(ruleField => {
      let rule = collection[ruleField] || '';
      
      // Remove explicit exclusion
      rule = rule.replace(/&&\s*@request\.auth\.role\s*!=\s*"verificador"/g, '');
      
      // Add explicit inclusion alongside admin
      if (rule.includes('@request.auth.role = "admin"') && !rule.includes('@request.auth.role = "verificador"')) {
        rule = rule.replace(
          '@request.auth.role = "admin"',
          '@request.auth.role = "admin" || @request.auth.role = "verificador"'
        );
      }
      
      collection[ruleField] = rule;
    });

    app.save(collection);
  });
});
