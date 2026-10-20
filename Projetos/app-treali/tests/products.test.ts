import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureSeedProducts,
  getAllProducts,
  getActiveProducts,
  saveProduct,
  deleteProduct,
  reorderProducts
} from '../src/db.ts'
import { closeChannel } from '../src/channel.ts'
import type { ProductFlavor } from '../src/types.ts'

test('Catálogo de produtos: seed inicial, cadastro, edição e desativação', async () => {
  // 1. Seed inicial dos 4 sabores padrão da Treali
  await ensureSeedProducts()
  let products = await getAllProducts()
  assert.equal(products.length >= 4, true)

  // 2. Cadastrar novo sabor
  const novoSabor: ProductFlavor = {
    id: 'queijo_coalho_30g',
    name: 'Queijo Coalho 30G',
    shortLabel: 'Queijo Coalho',
    unitPrice: 42.0,
    isActive: true
  }
  await saveProduct(novoSabor)

  products = await getAllProducts()
  const cadastrado = products.find((p) => p.id === 'queijo_coalho_30g')
  assert.ok(cadastrado)
  assert.equal(cadastrado?.unitPrice, 42.0)

  // 3. Editar preço e nome de um produto existente
  const editado: ProductFlavor = {
    ...cadastrado!,
    name: 'Queijo Coalho Especial 30G',
    unitPrice: 45.0
  }
  await saveProduct(editado)

  const atualizado = (await getAllProducts()).find((p) => p.id === 'queijo_coalho_30g')
  assert.equal(atualizado?.name, 'Queijo Coalho Especial 30G')
  assert.equal(atualizado?.unitPrice, 45.0)

  // 4. Desativar produto
  await saveProduct({ ...atualizado!, isActive: false })
  const ativos = await getActiveProducts()
  assert.equal(ativos.some((p) => p.id === 'queijo_coalho_30g'), false)

  // 5. Excluir produto
  await deleteProduct('queijo_coalho_30g')
  const aposExcluir = await getAllProducts()
  assert.equal(aposExcluir.some((p) => p.id === 'queijo_coalho_30g'), false)
})

test('Reordenação de Produtos: Drag & Drop reflete na lista de produtos e no app dos distribuidores', async () => {
  try {
    await ensureSeedProducts()
    const inicial = await getActiveProducts()
    assert.equal(inicial.length >= 4, true)

    // Inverte a ordem: Picante (que era o último) vai para o 1º lugar
    const picanteId = 'picante_30g'
    const baconId = 'bacon_30g'

    const novaOrdemIds = [
      picanteId,
      'tradicional_30g',
      'creme_alho_30g',
      baconId
    ]

    const reordenados = await reorderProducts(novaOrdemIds)
    assert.equal(reordenados[0].id, picanteId)
    assert.equal(reordenados[0].sortOrder, 0)
    assert.equal(reordenados[3].id, baconId)
    assert.equal(reordenados[3].sortOrder, 3)

    // getActiveProducts deve retornar estritamente ordenado por sortOrder
    const ativosOrdenados = await getActiveProducts()
    assert.equal(ativosOrdenados[0].id, picanteId)
    assert.equal(ativosOrdenados[0].name, 'Picante 30G')
    assert.equal(ativosOrdenados[1].id, 'tradicional_30g')
    assert.equal(ativosOrdenados[2].id, 'creme_alho_30g')
    assert.equal(ativosOrdenados[3].id, baconId)
  } finally {
    closeChannel()
  }
})
