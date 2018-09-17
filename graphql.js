// functions for graphql
const { camelCase, map, filter, partialRight, pick, each } = require('lodash');
const fs = require('fs');
const path = require('path');
const pascalCase = require('to-pascal-case');

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
      console.log('Unsupported File Type: file');
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

const processMutations = (qParams, pParams, bParams, name, _mutations) => {
  let mutation = {};
  mutation.mutationName = pascalCase(name);
  mutation.items = [];

  if (pParams) {
    for (let i=0;i<pParams.length;i+=1) {
      const param = pParams[i];
      let newItem = {};
      if (param.name !== null) {
        newItem.name = param.name;
        newItem.isRequired = param.required;
        newItem.type = param.type;
        newItem.isArray = false;
        mutation.items.push(newItem);
      }
    }
  }
  for (let i=0;i<qParams.length;i+=1) {
    const param = qParams[i];
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
      mutation.items.push(newItem);
    }
  }

  _mutations.push(mutation);
}

const processQueries = (params, pathParams, name, _queries) => {
  let query = {};
  query.queryName = pascalCase(name);
  query.items = [];
  if (pathParams) {
    for (let i=0;i<pathParams.length;i+=1) {
      const param = pathParams[i];
      let newItem = {};
      if (param.name !== null) {
        newItem.name = param.name;
        newItem.isRequired = param.required;
        newItem.type = param.type;
        newItem.isArray = false;
        query.items.push(newItem);
      }
    }
  }
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

const parseTypes = (_types) => {
  types = '';
  map(_types, mainType => {
    types += `\n\ttype ${mainType.typeName} {\n`;
    map(mainType.items, ({type, name, isArray}) => {
      types += `\t\t${name}: ${(isArray) ? '[' : ''}${parseItemType(type)}${(isArray) ? ']' : ''},\n`;
    })
    types += `\t}\n`;
  })
  types += `\n\ttype Query {\n`;
  return types;
}

const parseQueryTypes = (_queries) => {
  types = '';
  map(_queries, queryType => {
      types += `\t\t${queryType.queryName}(`;
      map(queryType.items, ({name, type, isArray, isRequired}) => {
        types += `${name}: ${(isArray) ? '[' : ''}${parseItemType(type)}${(isRequired) ? '!' : ''}${(isArray) ? ']' : ''},`;
      });
      types = `${(types.substring(types.length-1) === ',') ? types.substring(0,types.length-1) : types}): ${pascalCase(queryType.queryName)}Type,\n`;
  })
  return types;
}

const parseMutationTypes = (_mutations) => {
  mutations = '';

  return mutations;
}

const filterResponses = (responses,status) => filter(responses, { status })[0];

const processData = (data) => {
  let response = '';
  let query = '';
  let _types = [];
  let _queries = [];
  let _mutations = [];
  // What columns do we want out of the data;
  const picks = ['path','summary','query_params','responses','path_params','body_params'];
  let types = 'const typeDefs = `';
  // Gets
  const gets = map(filter(data, { verb: 'get', support_level: 'production'}), partialRight(pick, picks));
  const posts = map(filter(data, { verb: 'post', support_level: 'production'}), partialRight(pick, picks));
  const patches = map(filter(data, { verb: 'patch', support_level: 'production'}), partialRight(pick, picks));
  const deletes = map(filter(data, { verb: 'delete', support_level: 'production'}), partialRight(pick, picks));

  // Process Gets
  map(gets, eachGet => {
    let response = filterResponses(eachGet.responses, '200');
    if (response) {
      const respSchema = response.schema;
      // Get the schema types
      processSchema(respSchema, eachGet.summary, _types);
      // Get the query types
      processQueries(eachGet.query_params, eachGet.path_params, eachGet.summary, _queries);
    }
  })

  // Process Posts
  map(posts, eachPost => {
    let response = filterResponses(eachPost.responses, '201');
    if (response) {
      const respSchema = response.schema;
      // Get the schema types
      processSchema(respSchema, eachPost.summary, _types);
      // Get the mutation types
      processMutations(eachPost.query_params, eachPost.path_params, eachPost.body_params, eachPost.summary, _mutations);
    }
  })

  // Process Patches
  map(patches, eachPatch => {
    let response = filterResponses(eachPatch.responses, '200');
    if (response) {

    }
  })

  // Process Deletes
  map(deletes, eachDelete => {
    let response = filterResponses(eachDelete.responses, '200');
    if (response) {

    }
  })

  types += parseTypes(_types);
  types += parseQueryTypes(_queries);
  types += parseMutationTypes(_mutations);
  types += '\t}'
  types += '`;'

  // resolvers
  let resolvers = 'const resolvers = {\n';
  resolvers += '}\n\n';

  // Start response
  response += `import { makeExecutableSchema } from 'graphql-tools';\n\n`;

  // Add types to response
  response += types;

  // Add mutation types
  response += resolvers;

  // Finish it up
  response += `\n\nconst schema = makeExecutableSchema({\n\ttypeDefs,\n\tresolvers,\n});\n\nexport default schema;`;

  return response;
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
