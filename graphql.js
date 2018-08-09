// functions for graphql
const { camelCase, map, filter, partialRight, pick, each } = require('lodash');
const fs = require('fs');
const path = require('path');
const pascalCase = require('to-pascal-case');

let _mutations = {};

const parseItemType = (type,name) => {
  switch (type) {
    case 'string':
      return 'String';
      break;
    case 'integer':
      return 'Int';
      break;
    case 'boolean':
      return 'Boolean';
      break;
    case 'number':
      return 'Float';
      break;
    default:
      return type;
      break;
  }
}

const checkType = (_types, typeName) => {
  let found = false;
  each(_types, type => {
    if (type.typeName === typeName) {
      found = true;
      return false;
    }
  })
  return found;
}

navigatePropertiesArray = (props, parent, _types) => {
  let retProps = [];
  try {
    let count = 0;
    map(props, prop => {
      let newProp = {};
      newProp.name = prop.field;
      if (prop.type === 'string' || prop.type === 'integer' || prop.type === 'boolean' || prop.type === 'number') {
        newProp.type = prop.type;
        newProp.isArray = false;
      } else {
        if (prop.field) {
          const typeName = pascalCase(`${prop.field}`);
          const newTypeName = `${typeName}Type`;
          newProp.type = newTypeName;
          if (!checkType(_types, newTypeName)) {
            processSchema(prop, typeName, _types);
          }
          newProp.isArray = (prop.type === 'array') ? true : false;
        } else {
          console.log(`no field on ${parent}:`,prop);
        }
      }
      retProps.push(newProp);
    });
    return retProps;
    //console.log('props:',count);
  }
  catch(err) {
    console.log('error:',err);
  }
}

const processSchema = (schema, preName, _types) => {
  let mainType = {};
  mainType.typeName = `${pascalCase(preName)}Type`;

  if (schema.type) {
    const type = (Array.isArray(schema.type)) ? schema.type[0] : schema.type;
    if (type === 'array') {
      const items = schema.items;
      const properties = items.properties;
      mainType.items = navigatePropertiesArray(properties, mainType.typeName, _types);
    } else if (type === 'object') {
      const properties = schema.properties
      mainType.items = navigatePropertiesArray(properties, mainType.typeName, _types);
    } else if (type === 'file') {
      console.log('Unsupported File Type');
    } else if (type === 'string' || type === 'integer' || type === 'boolean' || type === 'number') {
      mainType.items = [];
      let item = {};
      item.name = schema.field;
      item.type = type;
      item.isArray = false;
      mainType.items.push(item);
    } else {
      console.log(`${preName} Unknown Type:`,type)
    }
  }
  if (!checkType(_types, mainType.typeName)) {
    _types.push(mainType);
  }
}

const processQueries = (params, name, _queries) => {
  let query = {};
  query.queryName = pascalCase(name);
  query.items = [];
  for (let i=0;i<params.length;i+=1) {
    const param = params[i];
    let newItem = {};
    if (param.name !== null) {
      newItem.name = param.name;
      newItem.isRequired = param.required;
      newItem.isArray = false;
      if (param.type === 'array') {
        if (param.name.indexOf('id')>-1) {
          newItem.type = 'integer';
          newItem.isArray = true;
        } else {
          newItem.type = param.type;
        }
      } else {
        newItem.type = param.type;
      }
      query.items.push(newItem);
    }
  }
  _queries.push(query);
}

const processData = (data) => {
  let response = '';
  let query = '';
  let _types = [];
  let _queries = [];
  // What columns do we want out of the data;
  const picks = ['path','summary','query_params','responses'];
  let types = 'const typeDefs = `';
  // Gets
  const gets = map(filter(data, { verb: 'get', support_level: 'production'}), partialRight(pick, picks));

  map(gets, eachGet => {
    let response = filter(eachGet.responses, { status: '200' })[0];
    if (response) {
      const respSchema = response.schema;
      // Get the schema types
      processSchema(respSchema, eachGet.summary, _types);
      // Get the query types
      processQueries(eachGet.query_params, eachGet.summary, _queries);
      // Figure out what to do with the path parameters
      //processPathParams(eachGet.path_params, eachGet.summary);
    }
  })
  map(_types, mainType => {
    types += `\n\ttype ${mainType.typeName} {\n`;
    map(mainType.items, ({type, name, isArray}) => {
      types += `\t\t${name}: ${(isArray) ? '[' : ''}${parseItemType(type)}${(isArray) ? ']' : ''},\n`;
    })
    types += `\t}\n`;
  })
  types += `\n\ttype Query {\n`;
  map(_queries, queryType => {
    types += `\t\t${queryType.queryName}(`;
    map(queryType.items, ({name, type, isArray, isRequired}) => {
      types += `${name}: ${(isArray) ? '[' : ''}${parseItemType(type)}${(isRequired) ? '!' : ''}${(isArray) ? ']' : ''},`;
    })
    types = `${(types.substring(types.length-1) === ',') ? types.substring(0,types.length-1) : types}): ${pascalCase(queryType.queryName)}Type,\n`;
  })
  types += '\t}'
  types += '`;'

  // Add types to response
  response += types;

  return response;
  // Post
  //const posts = map(filter(data, { verb: 'post'}), partialRight(pick, picks));
  // Patch
  //const patches = map(filter(data, { verb: 'patch'}), partialRight(pick, picks));
  // Delete
  //const deletes = map(filter(data, { verb: 'delete'}), partialRight(pick, picks));
}

const createEndpointSchema = (libPath, dest, name, data) => {
  // Where are we going to put the schema?
  const endpointsFolderPath = path.join(libPath, dest);
  // What are we going to call the file?
  const camelName = `${camelCase(name)}Schema`;
  const camelFileName = `${camelName}.js`;
  // Type Definitions
  const schema = processData(data);
  fs.writeFileSync(path.join(path.join(libPath, dest),`${camelName}.js`), schema);

  return {
    import: `import ${camelName} from './${dest}/${camelName}'`,
    name: camelName,
  };
}

module.exports = createEndpointSchema;
