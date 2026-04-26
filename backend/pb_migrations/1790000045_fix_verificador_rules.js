migrate((app) => {
  const collection = app.findCollectionByNameOrId('clientes');
  
  if (collection) {
    let rule = collection.updateRule || '';
    rule = rule.replace('&& @request.auth.role != "verificador"', '');
    collection.updateRule = rule;
    app.save(collection);
  }
  
  // also fix clientes_dictamenes if it has the same rule
  const dictamenes = app.findCollectionByNameOrId('clientes_dictamenes');
  if (dictamenes) {
    let crule = dictamenes.createRule || '';
    crule = crule.replace('&& @request.auth.role != "verificador"', '');
    dictamenes.createRule = crule;
    
    let urule = dictamenes.updateRule || '';
    urule = urule.replace('&& @request.auth.role != "verificador"', '');
    dictamenes.updateRule = urule;
    
    app.save(dictamenes);
  }
});
