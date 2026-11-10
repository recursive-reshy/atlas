// Vitest
import { describe, expect, it } from 'vitest'

describe( 'browser mode', () => {
  it( 'runs in a real browser with layout', () => {
    const box = document.createElement( 'div' )
    box.style.cssText = 'width: 120px; height: 40px; overflow-y: auto'
    box.textContent = 'Hello'
    document.body.append( box )

    expect( box.offsetHeight ).toBe( 40 )
    expect( getComputedStyle( box ).overflowY ).toBe( 'auto' )

    box.remove()
  } )

  it( 'keeps a real selection', () => {
    const paragraph = document.createElement( 'p' )
    paragraph.textContent = 'Select me'
    document.body.append( paragraph )

    const range = document.createRange()
    range.setStart( paragraph.firstChild as Text, 0 )
    range.setEnd( paragraph.firstChild as Text, 6 )
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange( range )

    expect( document.getSelection()?.toString() ).toBe( 'Select' )

    paragraph.remove()
  } )
} )
